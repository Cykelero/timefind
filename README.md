# ⏮ timefind

timefind lets you find the exact moment that something was added to a website.  
It quickly flips through [Web Archive](https://archive.org/web/) snapshots using [binary search](https://en.wikipedia.org/wiki/Binary_search), pinpointing the date of the modification.

For example, you can search for the first mention of the iPhone on Apple's homepage:

<pre>
<b>$ timefind</b> apple.com iphone
</pre>

<pre>
Looking for string predicate <strong>“iphone”</strong>.

<strong>Getting snapshot list for apple.com...</strong>
Got 212,432 snapshots, from 96-10-23 18:55:02 to 21-05-30 14:37:26.

<strong>Checking extremities...</strong>
<em>Doesn't match:</em> 96-10-23 18:55:02 (<a href="http://web.archive.org/web/19961023165502/http://www.apple.com:80/">http://web.archive.org/web/19961023165502/http://www.apple.com:80/</a>)
<em>Matches:</em> 21-05-30 14:37:26 (<a href="http://web.archive.org/web/20210530123726/https://www.apple.com/">http://web.archive.org/web/20210530123726/https://www.apple.com/</a>)

<strong>Searching...</strong>
<em>Matches:</em> 09-02-10 20:10:32 (<a href="http://web.archive.org/web/20090210191032/http://www.apple.com:80/">http://web.archive.org/web/20090210191032/http://www.apple.com:80/</a>)
<em>Doesn't match:</em> 02-12-06 00:43:50 (<a href="http://web.archive.org/web/20021205234350/http://www.apple.com:80/?">http://web.archive.org/web/20021205234350/http://www.apple.com:80/?</a>)
<em>Doesn't match:</em> 06-01-08 21:04:20 (<a href="http://web.archive.org/web/20060108200420/http://apple.com:80/">http://web.archive.org/web/20060108200420/http://apple.com:80/</a>)
<em>Matches:</em> 07-07-25 23:28:27 (<a href="http://web.archive.org/web/20070725212827/http://www.apple.com/">http://web.archive.org/web/20070725212827/http://www.apple.com/</a>)
[...]
<em>Doesn't match:</em> 07-01-09 19:48:16 (<a href="http://web.archive.org/web/20070109184816/http://www.apple.com/">http://web.archive.org/web/20070109184816/http://www.apple.com/</a>)
<em>Doesn't match:</em> 07-01-09 19:48:16 (<a href="http://web.archive.org/web/20070109184816/http://www.apple.com/">http://web.archive.org/web/20070109184816/http://www.apple.com/</a>)

<strong>Bisecting completed!</strong>
Last non-matching snapshot is 07-01-09 19:48:16 (<a href="http://web.archive.org/web/20070109184816/http://www.apple.com/)">http://web.archive.org/web/20070109184816/http://www.apple.com/)</a>.
First matching snapshot is 07-01-10 06:21:28 (<a href="http://web.archive.org/web/20070110052128/http://www.apple.com:80/)">http://web.archive.org/web/20070110052128/http://www.apple.com:80/)</a>.
</pre>

Voilà! Click through that last URL (the “first matching snapshot”), and you'll see how the very first iPhone was marketed. Or, follow the preceding link (the “last non-matching snapshot”) to see the website right before the announcement was made.

## 🛠 Usage

### Installing timefind

With [Node.js](https://nodejs.org/) present, install timefind globally by running `npm install -g timefind`.

timefind supports macOS, Linux, and Windows.

### Performing a search

To use timefind, supply it with a URL to investigate and a string to search for. It'll find the very first appearance of the string.  
For instance, this will look for the first mention of “community” on the Elm homepage:
<pre>
<b>$ timefind</b> elm-lang.org community
</pre>

timefind's default behavior is fairly specific (it only looks for [complete words](#-b---no-smart-disable-smart-matching), in [user-visible text](#-a---full-source-dont-limit-search-to-user-visible-text), that were [added but not removed](#-i---inverse-inverse-the-predicate)). Look through [the options](#-options) to pick the right settings for your search.

### 💬 Important note: binary search
> To quickly scan through thousands of snapshots, timefind relies on _binary search_, the same algorithm used by the [git bisect](https://git-scm.com/docs/git-bisect) command.  
The downside of this method is that it can only search for _changes that do not get reversed_. If the change you're looking for was eventually undone—for instance, a promo banner was displayed for a month only—you'll have to [restrict the search timeframe](#--oldest---newest-restrict-the-search-timeframe) for timefind to work.

## 🎛 Options

timefind's default behavior is to look for _a string being added_, and then never removed, for the complete lifetime of the page. You can change this behavior using options.

Use a different kind of predicate, like a regex or a function, using predicate arguments. Alter search behavior, such as looking for the disappearance of something, using search behavior arguments.

#### Predicate types

- [**#1 --string:** specify a string predicate](#1---string-specify-a-string-predicate)
- [**-r --regex:** specify a regular expression predicate](#-r---regex-specify-a-regular-expression-predicate)
- [**-f --function:** specify a function predicate](#-f---function-specify-a-function-predicate)
- [No predicate: interactive mode](#no-predicate-interactive-mode)

#### Search behavior

- [**-i --inverse:** inverse the predicate](#-i---inverse-inverse-the-predicate)
- [**--oldest, --newest:** restrict the search timeframe](#--oldest---newest-restrict-the-search-timeframe)
- [**-a --full-source:** don&#39;t limit search to user-visible text](#-a---full-source-dont-limit-search-to-user-visible-text)
- [**-b --no-smart:** disable smart matching](#-b---no-smart-disable-smart-matching)

### `#1 --string`: specify a string predicate

The default option. To match, a page must contain the string.

For instance, look for when the Undertale site started mentionned merchandise:
<pre>
<b>$ timefind</b> undertale.com merch
</pre>

### `-r --regex`: specify a regular expression predicate

To match, a page must match the regex.  
You can omit the regex's surrounding slashes, except if you want to specify flags. (although by default, most flags are redundant because of [smart matching](#-b---no-smart-disable-smart-matching)  
Make sure to escape backslashes.

For instance, find when a Wikipedia reached a million articles:
<pre>
<b>$ timefind</b> wikipedia.org -r '\\d \\d{3} \\d{3}'
</pre>

### `-f --function`: specify a function predicate

The supplied function is called for each page, receiving the page's root `Document` node. It must return `true` if the page matches.  
Make sure to escape backslashes and nested quotes.  

For instance, search for the moment where the W3 published their one-thousandth standard:
<pre>
<b>$ timefind</b> www.w3.org/TR/ -f 'dom => dom.getElementsByClassName("pubdetails").length >= 1000'
</pre>

### No predicate: interactive mode

If you don't specify a predicate, timefind will be in interactive mode: for each page it considers, it'll open the page in your default browser, and ask you whether or not the page matches.

Use this as a last resort, as this way of searching is significantly slower than non-interactive mode.

You could for instance try to find when Stripe last redesigned their website. Reply yes when you see the new design, and no when you see an older one:
<pre>
<b>$ timefind</b> stripe.com
</pre>

### `-i --inverse`: inverse the predicate

By flipping the predicate, you can ask timefind to look for the _removal_ of a string, instead of the _addition_ of a string.

For instance, the early Khan Academy website would emphasize SAT preparation, but no longer mentions it at all anymore. You can find out when the SAT stopped being one of their selling points:
<pre>
<b>$ timefind</b> khanacademy.org 'sat prep' -i
</pre>

This works with all predicate types.

### `--oldest`, `--newest`: restrict the search timeframe

To search for a change that was eventually reverted, you need to pick a timeframe during which the change was _not_ reverted. The `--oldest` and `--newest` options let you pick a start date and an end date for the search. You can use only one or both at the same time.

The options accept multiple levels of precision, from `2011-03-12 10:30`, to simply `2011` (which is interpreted as `2011-01-01 00:00`).

For instance, we know that version 5 “Juno” of elementary OS was released some time in 2018. This means “Juno” was mentioned on the project's site for a while, before eventually being replaced by the name of the following release.  
If we simply execute `timefind elementary.io juno`, the search will fail, as the name no longer appears on the page. But we can assume that it was still there in January 2019, and restrict the search:
<pre>
<b>$ timefind</b> elementary.io juno --newest 2019
</pre>

This search works because the truncated timeframe only contains a single transition, from _Juno isn't mentioned_ to _Juno is mentioned_.

### `-a --full-source`: don't limit search to user-visible text

By default, timefind only searches through _user-visible text_: the text displayed on the page, and the contents of `alt` and `title` attributes.  
The `--full-source` option instructs timefind to search the complete raw page source instead.

For instance, you can find out when a video was first added to the Celeste website, by looking for the “youtube” string in the source, which shows up once they start using the YouTube embedded player:
<pre>
<b>$ timefind</b> celestegame.com youtube -a
</pre>

### `-b --no-smart`: disable smart matching

By default, for string and regex predicates, timefind performs smart matching:
- **case is ignored**: uppercase and lowercase are considered equivalent
- **runs of whitespace are collapsed into a single space**: multiple spaces, line breaks, non-breakable spaces, etc, are all replaced with a single space
- **only complete words match**: for instance, the predicate “possible” will not match the word “impossible”

The `--no-smart` option disables these three behaviors.

## 👩🏿‍💻 Contributing

If you'd like to contribute code to timefind (thank you for considering it!), be warned: timefind is written using [Tasklemon](https://github.com/cykelero/tasklemon). The API is nice and all, but Tasklemon wasn't meant for creating npm packages; the main resulting limitation is that the source code pretty much has to be all contained within a single file.
