#!/usr/bin/env lemon
#version 0.2

const chalk = npm.chalk;

cli.accept({
	pageURL: ["#0", String, "The URL to a webpage to search"],
	
	predicateString: ["#1 -s --string", String, "A string predicate, to search for in page source"],
	predicateRegex: ["-r --regex", RegExp, "A regex predicate, to be matched against page source"],
	predicateFunction: ["-f --function", eval, "A JavaScript function predicate, to execute against page DOM"],
	inversePredicate: ["-i --inverse", Boolean, "Inverses the predicate (good is bad, bad is good)"],
});

const webArchiveTimemapBaseURL = "http://web.archive.org/web/timemap/link/";

async function getMementosForURL(url) {
	const timemap = await net.getText(webArchiveTimemapBaseURL + url);
	
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

// Run
// // Get memento list
cli.tell(`Downloading memento list for ${cli.args.pageURL}...`);
const mementos = await getMementosForURL(cli.args.pageURL);

const firstMemento = mementos[0];
const lastMemento = mementos[mementos.length - 1];

cli.tell(`Got ${format.number(mementos.length, "memento", 0)}, from ${format.date(firstMemento.date)} to ${format.date(lastMemento.date)}.`);


// Check extremities
cli.tell("");
cli.tell("Checking extremities...");

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
cli.tell("Searching...");
let currentRange = mementos;

while (currentRange.length > 2) {
	let midpointMemento = null;
	
	// Find midpoint memento
	const midpointTime = (currentRange[0].date.unix() + currentRange[currentRange.length - 1].date.unix()) / 2;
	
	midpointMemento = currentRange[1];
	for (let index = 2; index < currentRange.length - 1; index++) {
		const memento = currentRange[index];
		
		const currentMidpointDistance = Math.abs(midpointMemento.date.unix() - midpointTime);
		const mementoDistance = Math.abs(memento.date.unix() - midpointTime);
		
		if (mementoDistance < currentMidpointDistance) {
			midpointMemento = memento;
		}
	}
	
	// Evaluate memento, shrink range
	const midpointIndex = currentRange.indexOf(midpointMemento);
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
cli.tell("Bisecting completed!");
cli.tell(`Last good version is ${chalk.bold(format.date(lastGood.date))} (${chalk.bold(lastGood.url)}).`);
cli.tell(`First bad version is ${chalk.bold(format.date(firstBad.date))} (${chalk.bold(firstBad.url)}).`);
