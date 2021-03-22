#!/usr/bin/env lemon
#version 0.2

const chalk = npm.chalk;

cli.accept({
	pageURL: ["#0", String, "The URL to a webpage to search"],
	
	predicateString: ["#1 -s --string", String, "A string predicate, to search for in page source"],
	predicateRegex: ["-r --regex", RegExp, "A regex predicate, to be matched against page source"],
	predicateFunction: ["-f --function", eval, "A JavaScript function predicate, to execute against page DOM"],
	inversePredicate: ["-i --inverse", Boolean, "Inverses the predicate (good is bad, bad is good)"],
	
	oldest: ["--oldest", moment, "The date of the oldest version to consider"],
	newest: ["--newest", moment, "The date of the newest version to consider"]
});

const webArchiveTimemapBaseURL = "http://web.archive.org/web/timemap/link/";

async function getMementosForURL(url) {
	let timemap;
	
	// Get and cache timemap
	const timemapCache = here.file(url.replace(/\//g, "-") + ".timemap-cache.txt");
	
	if (timemapCache.exists) {
		timemap = timemapCache.content;
	} else {
		timemap = await net.getText(webArchiveTimemapBaseURL + url);
		timemapCache.make();
		timemapCache.content = timemap;
	}
	
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
	if (cli.args.predicateFunction) {
		// Execute function
		const pageDOM = await net.getDOM(url);
		return cli.args.predicateFunction(pageDOM);
	} else if (cli.args.predicateRegex) {
		// Match regex
		const pageSource = await net.getText(url);
		return cli.args.predicateRegex.test(pageSource);
	} else if (cli.args.predicateString !== null) {
		// Match string
		const pageSource = await net.getText(url);
		return pageSource.includes(cli.args.predicateString);
	} else {
		// Ask user
		cli.tell("Opening " + chalk.bold(url) + ". Is this page good? " + chalk.gray("(y/n)"));
		npm.open(url);
		
		return await cli.ask("", Boolean);
		
		// return new Promise(resolve => {
		// 	npm. iohook.on("keypress", event => {
		// 		const isGood = {
		// 			y: true,
		// 			n: false
		// 		}[event.keychar];
		//
		// 		if (isGood !== undefined) {
		// 			resolve(isGood);
		// 		}
		// 	});
		//
		// 	npm. iohook.start();
		// });
	}
}

class Memento {
	constructor(mementoLine) {
		this.url = /<([^>]+)>/.exec(mementoLine)[1];
		this.date = moment(/\bdatetime="([^"]+)"/.exec(mementoLine)[1]);
		
		this._good = null;
	}
	
	get isGood() {
		const self = this;
		
		return new Promise(async function(resolve) {
			if (self._good === null) {
				self._good = await self._getEvaluation();
			}
		
			resolve(self._good);
		});
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
let filteredMementos = null;

// // Get memento list
cli.tell(chalk.blue(`Getting memento list for ${cli.args.pageURL}...`));

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
	filteredText = ` (out of ${format.number(allMementos.length, "memento", 0)})`;
} else {
	filteredMementos = allMementos;
}

const firstMemento = filteredMementos[0];
const lastMemento = filteredMementos[filteredMementos.length - 1];

cli.tell(`Got ${format.number(filteredMementos.length, "memento", 0)}, from ${format.date(firstMemento.date)} to ${format.date(lastMemento.date)}${filteredText}.`);


// Check extremities
cli.tell("");
cli.tell(chalk.blue("Checking extremities..."));

if (!await firstMemento.isGood) {
	cli.tell(chalk.red(`The oldest version of the page (${firstMemento.url}) is ` + chalk.bold("bad") + ". Aborting."));
	process.exit(1);
}

if (await lastMemento.isGood) {
	cli.tell(chalk.red(`The newest version of the page (${lastMemento.url}) is ` + chalk.bold("good") + ". Aborting."));
	process.exit(1);
}

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
	const mementoString = `${format.date(midpointMemento.date)} (${midpointMemento.url})`;
	if (await midpointMemento.isGood) {
		cli.tell("Good: " + mementoString);
		currentRange = currentRange.slice(midpointIndex);
	} else {
		cli.tell("Bad: " + mementoString);
		currentRange = currentRange.slice(0, midpointIndex + 1);
	}
}

// // Display result
const lastGood = currentRange[0];
const firstBad = currentRange[1];

cli.tell("");
cli.tell(chalk.blue("Bisecting completed!"));
cli.tell(`Last good version is ${chalk.bold(format.date(lastGood.date))} (${chalk.bold(lastGood.url)}).`);
cli.tell(`First bad version is ${chalk.bold(format.date(firstBad.date))} (${chalk.bold(firstBad.url)}).`);
