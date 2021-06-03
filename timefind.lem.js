#!/usr/bin/env lemon
#version 0.2

cli.accept({
	pageURL: ["#0", String, "The URL to a webpage to search"],
	
	predicateString: ["#1 -s --string", String, "A string predicate, to search for in page text"],
	predicateRegex: ["-r --regex", RegExp, "A regex predicate, to be matched against page text"],
	predicateFunction: ["-f --function", eval, "A JavaScript function predicate, to execute against page DOM"],
	
	inversePredicate: ["-i --inverse", Boolean, "Inverses the predicate (to match, a page must fail the predicate)"],
	fullSource: ["-a --full-source", Boolean, "Matches against full page source, instead of only user-visible text. Only affects string and regex predicates."],
	caseSensitive: ["-c --case-sensitive", Boolean, "Makes the predicate case-sensitive. Only affects string and regex predicates."],
	
	oldest: ["--oldest", moment, "The date of the oldest snapshot to consider"],
	newest: ["--newest", moment, "The date of the newest snapshot to consider"],
	
	noCache: ["--no-cache", Boolean, "Skips the network request cache"],
	clearCache: ["--clear-cache", Boolean, "Clears the network request cache"]
});

const chalk = npm.chalk;

const webArchiveTimemapBaseURL = "http://web.archive.org/web/timemap/link/";

const cacheFolder = home.folder(".cache/timefind/");
const maxTimemapCacheAge = moment.duration(1, "week");

async function getTextAtURLWithCache(url, maxAge) {
	const sanitizedURL = url.replace(/[\/:?]/g, "-");
	const cacheFile = cacheFolder.file(sanitizedURL + ".web-cache.txt");
	
	const cacheForever = !maxAge
	const oldestCacheDate = !cacheForever && moment().subtract(maxAge);
	
	const readCache =
		!cli.args.noCache
		&& cacheFile.exists
		&& (cacheForever || cacheFile.dateModified.isAfter(oldestCacheDate))
	
	if (readCache) {
		return cacheFile.content;
	} else {
		const text = await net.getText(url);
		
		cacheFile.make(true);
		cacheFile.content = text;
		
		return text;
	}
}

async function getMementosForURL(url) {
	const timemap = await getTextAtURLWithCache(webArchiveTimemapBaseURL + url, maxTimemapCacheAge);
	
	// Parse and return
	const mementoLines = timemap.split("\n");
	const mementos = mementoLines
		.filter(mementoLine => /\brel="memento"/.test(mementoLine))
		.map(mementoLine => new Memento(mementoLine));
	
	return mementos;
}

async function evaluateURL(url) {
	if (cli.args.inversePredicate) {
		return !(await executePredicateForURL(url));
	} else {
		return await executePredicateForURL(url);
	}
}

async function executePredicateForURL(url) {
	const page = await Page.forURL(url);
	
	if (cli.args.predicateFunction) {
		// Execute function
		return cli.args.predicateFunction(page.dom);
	} else if (cli.args.predicateRegex) {
		// Match regex
		const subjectStrings = page.getSearchableStrings();
		let predicateRegex = cli.args.predicateRegex;
		
		// // Case insensitive?
		if (!cli.args.caseSensitive) {
			predicateRegex = new RegExp(predicateRegex, "i");
		}
		
		// // Match
		return subjectStrings.some(subject => predicateRegex.test(subject));
	} else if (cli.args.predicateString) {
		// Match string
		let subjectStrings = page.getSearchableStrings();
		let predicateString = cli.args.predicateString;
		
		// // Case insensitive?
		if (!cli.args.caseSensitive) {
			subjectStrings = subjectStrings.map(subject => subject.toLowerCase());
			predicateString = predicateString.toLowerCase();
		}
		
		// // Match
		return subjectStrings.some(subject => subject.includes(predicateString));
	} else {
		// Ask user
		cli.tell("Opening " + chalk.bold(url) + ". Does this page match? " + chalk.gray("(y/n)"));
		npm.open(url);
		
		return await cli.ask("", Boolean);
	}
}

class Page {
	constructor(url, source) {
		this.url = url;
		this.source = source;
	}
	
	get dom() {
		const parsedPage = new (npm.jsdom.JSDOM)(this.source, {url: this.url});
		return parsedPage.window.document;
	}


	getSearchableStrings() {
		if (cli.args.fullSource) {
			// Search full source
			return [this.source];
		} else {
			// Search user-visible text only
			const result = [this.dom.body.textContent];
		
			const annotatedElements = this.dom.querySelectorAll("[alt], [title]");
			for (let element of annotatedElements) {
				if (element.alt) result.push(element.alt);
				if (element.title) result.push(element.title);
			}
		
			return result;
		}
	}
	
	static async forURL(url, maxAge) {
		const source = await getTextAtURLWithCache(url, maxAge);
		
		return new Page(url, source);
	}
}

class Memento {
	constructor(mementoLine) {
		this.url = /<([^>]+)>/.exec(mementoLine)[1];
		this.date = moment(/\bdatetime="([^"]+)"/.exec(mementoLine)[1]);
		
		this._matches = null;
	}
	
	get matches() {
		const self = this;
		
		return new Promise(async function(resolve) {
			if (self._matches === null) {
				self._matches = await self._getEvaluation();
			}
		
			resolve(self._matches);
		});
	}
	
	toString() {
		return `${format.date(this.date)} (${this.url})`;
	}

	async _getEvaluation() {
		return await evaluateURL(this.url);
	}
}

function closestTimeIndexInArray(array, time) {
	let matchIndex = 0;
	
	for (let candidateIndex = 1; candidateIndex < array.length; candidateIndex++) {
		const candidate = array[candidateIndex];
		
		const currentMatchDistance = Math.abs(array[matchIndex] - time);
		const candidateDistance = Math.abs(candidate - time);
		
		if (candidateDistance < currentMatchDistance) {
			matchIndex = candidateIndex;
		}
	}
	
	return matchIndex
}

// Run
if (cli.args.clearCache) {
	cli.tell("Clearing network request cache...");
	cacheFolder.empty(true);
	cli.tell("Done.");
	process.exit(0);
}

let filteredMementos = null;

// // Get memento list
cli.tell(chalk.blue(`Getting snapshot list for ${cli.args.pageURL}...`));

const allMementos = await getMementosForURL(cli.args.pageURL);
let filteredText = "";

if (cli.args.oldest || cli.args.newest) {
	const allTimes = allMementos.map(memento => memento.date.unix());
	
	const oldestIndex =
		cli.args.oldest
		? closestTimeIndexInArray(allTimes, cli.args.oldest.unix())
		: 0;
	
	const newestIndex =
		cli.args.newest
		? closestTimeIndexInArray(allTimes, cli.args.newest.unix())
		: allMementos.length - 1;
	
	filteredMementos = allMementos.slice(oldestIndex, newestIndex);
	filteredText = ` (out of ${format.number(allMementos.length, "snapshot", 0)})`;
} else {
	filteredMementos = allMementos;
}

if (filteredMementos.length < 2) {
	if (filteredMementos.length === 0) {
		cli.tell(chalk.red(`Can't perform search: no snapshot available.`));
	} else {
		cli.tell(chalk.red(`Can't perform search: only ${format.number(filteredMementos.length, "snapshot", 0)} available.`));
	}
	process.exit(1);
}

const firstMemento = filteredMementos[0];
const lastMemento = filteredMementos[filteredMementos.length - 1];

cli.tell(`Got ${format.number(filteredMementos.length, "snapshot", 0)}, from ${format.date(firstMemento.date)} to ${format.date(lastMemento.date)}${filteredText}.`);


// Check extremities
cli.tell("");
cli.tell(chalk.blue("Checking extremities..."));

if (await firstMemento.matches) {
	cli.tell(chalk.bold("Matches: ") + firstMemento);
	cli.tell(chalk.red("The oldest snapshot of the page matches. Aborting."));
	cli.tell("");
	
	if (!cli.args.inverse) {
		cli.tell(`If you are looking for a removal instead of an addition, you can try inverting your predicate using the ${chalk.bold("--inverse")} option. (to match, a page will need to fail the predicate)`);
	}
	
	if (!cli.args.oldest && !cli.args.newest) {
		cli.tell(`If the change you are looking for was temporary, you can bound your search between dates using ${chalk.bold("--oldest")} and/or ${chalk.bold("--newest")}.`);
	}
	
	process.exit(1);
}
cli.tell(chalk.bold("Doesn't match: ") + firstMemento);

if (!await lastMemento.matches) {
	cli.tell(chalk.bold("Doesn't match: ") + lastMemento);
	cli.tell(chalk.red("The newest snapshot of the page doesn't match. Aborting."));
	
	if (!cli.args.oldest && !cli.args.newest) {
		cli.tell("");
		cli.tell(`If the change you are looking for was temporary, you can bound your search using the ${chalk.bold("--newest")} option.`);
	}
	
	process.exit(1);
}
cli.tell(chalk.bold("Matches: ") + lastMemento);

// // Start the search
cli.tell("");
cli.tell(chalk.blue("Searching..."));
let currentRange = filteredMementos;

while (currentRange.length > 2) {
	// Find midpoint memento
	const midpointTime = (currentRange[0].date.unix() + currentRange[currentRange.length - 1].date.unix()) / 2;
	
	const midpointIndex = closestTimeIndexInArray(
		currentRange
			.slice(1, -1)
			.map(memento => memento.date.unix()),
		midpointTime
	) + 1;
	const midpointMemento = currentRange[midpointIndex];
	
	// Evaluate memento, shrink range
	if (await midpointMemento.matches) {
		cli.tell(chalk.bold("Matches: ") + midpointMemento);
		currentRange = currentRange.slice(0, midpointIndex + 1);
	} else {
		cli.tell(chalk.bold("Doesn't match: ") + midpointMemento);
		currentRange = currentRange.slice(midpointIndex);
	}
}

// // Display result
const lastMiss = currentRange[0];
const firstMatching = currentRange[1];

cli.tell("");
cli.tell(chalk.blue("Bisecting completed!"));
cli.tell(`Last non-matching snapshot is ${chalk.bold(lastMiss)}.`);
cli.tell(`First matching snapshot is ${chalk.bold(firstMatching)}.`);
