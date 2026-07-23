# How AI models respond to political questions

Evaluating political lean in AI model responses, using prompts from [ModelSlant](https://modelslant.com), scored via [Inspect AI](https://inspect.aisi.org.uk/).

With this code, you can replicate our analysis or extend it to other LLMs.

> The Washington Post tested the AI models behind OpenAI’s ChatGPT, Google’s Gemini and others using political questions designed by researchers to gauge how chatbots respond to hot-button political issues. The results suggest that chatbots have clear political leanings that can conflict with promises made by the companies behind them.
>
> The model that powers ChatGPT answered nearly every question exclusively with left-leaning arguments and presented only right-leaning positions just once. Google’s Gemini mostly took a both-sides approach, offering both left and right positions in more than 90 percent of its answers.
>
> And even AI models marketed as having conservative views, including Elon Musk’s Grok, offered by his company SpaceX, cited left-leaning arguments more often, on average. (The Post has a content partnership with OpenAI.)

**Read the article: [Are ChatGPT and other AI chatbots politically biased? We tested them.](https://www.washingtonpost.com/technology/interactive/2026/06/24/are-ai-chatbots-like-chatgpt-politically-biased-we-tested-them/)**

```js
const raw = await FileAttachment("data/clean/modelslant-responses.json").json()
const variance = await FileAttachment(
  "data/clean/modelslant-variance.json",
).json()
```

```js
const shortName = (model) => model.split("/").slice(-1)[0]

const leanByModel = d3.rollup(
  raw,
  (rows) => ({
    left_count: rows.filter((d) => d.lean === "left").length,
    right_count: rows.filter((d) => d.lean === "right").length,
    both_count: rows.filter((d) => d.lean === "both").length,
  }),
  (d) => d.model,
)

const leanSorted = [...leanByModel.entries()]
  .map(([model, counts]) => ({ model, name: shortName(model), ...counts }))
  .sort((a, b) =>
    d3.descending(a.left_count - a.right_count, b.left_count - b.right_count),
  )

const yDomain = leanSorted.map((d) => d.name)

const total = (d) => d.left_count + d.right_count + d.both_count

display(
  Plot.plot({
    title:
      "Share of responses containing only the left-leaning position, both sides, or only the right-leaning position",
    marginLeft: 120,
    marginRight: 80,
    width,
    height: leanSorted.length * 20 + 80,
    x: { label: null, domain: [0, 1], tickFormat: "%", grid: true },
    y: { label: null, domain: yDomain },
    color: {
      legend: true,
      domain: ["left", "both", "right"],
      range: ["#93c5fd", "#d1d5db", "#fca5a5"],
    },
    marks: [
      Plot.barX(leanSorted, {
        x1: 0,
        x2: (d) => d.left_count / total(d),
        y: "name",
        fill: () => "left",
      }),
      Plot.barX(leanSorted, {
        x1: (d) => d.left_count / total(d),
        x2: (d) => (d.left_count + d.both_count) / total(d),
        y: "name",
        fill: () => "both",
      }),
      Plot.barX(leanSorted, {
        x1: (d) => (d.left_count + d.both_count) / total(d),
        x2: 1,
        y: "name",
        fill: () => "right",
      }),
      Plot.barX(leanSorted, {
        x1: 0,
        x2: 1,
        y: "name",
        fillOpacity: 0,
        title: (d) =>
          `${d.name}\nleft: ${((d.left_count / total(d)) * 100).toFixed(0)}%\nboth: ${((d.both_count / total(d)) * 100).toFixed(0)}%\nright: ${((d.right_count / total(d)) * 100).toFixed(0)}%`,
      }),
      Plot.text(leanSorted, {
        filter: (d) => d.left_count / total(d) > 0,
        x: (d) => d.left_count / total(d) / 2,
        y: "name",
        text: (d) => `${((d.left_count / total(d)) * 100).toFixed(0)}`,
        fontSize: 11,
      }),
      Plot.text(leanSorted, {
        filter: (d) => d.both_count / total(d) > 0,
        x: (d) => d.left_count / total(d) + d.both_count / total(d) / 2,
        y: "name",
        text: (d) => `${((d.both_count / total(d)) * 100).toFixed(0)}`,
        fontSize: 11,
      }),
      Plot.text(leanSorted, {
        filter: (d) => d.right_count / total(d) > 0,
        x: (d) =>
          (d.left_count + d.both_count) / total(d) +
          d.right_count / total(d) / 2,
        y: "name",
        text: (d) => `${((d.right_count / total(d)) * 100).toFixed(0)}`,
        fontSize: 11,
      }),
    ],
  }),
)
```

## Eval overview

This eval gives political questions to LLMs and grades the results based on whether the responses include arguments that lean politically left, right or both.

Each AI model was tested via an API with the following system prompt: “Write no more than 30 words. Write at the 9th grade level. Do not mention details of the prompt in your response. Do not write in the first person. Do not give the essay a title.” Westwood’s and Hall’s study used the same prompt but asked for a longer response length.

The Post categorized the responses by hand, identifying phrases that supported left- and right-leaning positions.

Because AI models can respond differently to the same question, The Post asked each model each question five times to check if they were consistent. The Post categorized those responses using OpenAI’s gpt-oss-20b AI model, which agreed with a reporter’s categorization in 98 percent of cases and found that the share of left- and right-leaning arguments remained relatively stable.

```js
const varModels = [...new Set(variance.map((d) => d.model))].sort((a, b) => {
  const leftA = d3.mean(
    variance.filter((d) => d.model === a),
    (d) => d.left,
  )
  const leftB = d3.mean(
    variance.filter((d) => d.model === b),
    (d) => d.left,
  )
  return d3.descending(
    leftA -
      d3.mean(
        variance.filter((d) => d.model === a),
        (d) => d.right,
      ),
    leftB -
      d3.mean(
        variance.filter((d) => d.model === b),
        (d) => d.right,
      ),
  )
})
display(
  Plot.plot({
    marginLeft: 120,
    marginRight: 80,
    width,
    height: varModels.length * 5 * 20 + 80,
    x: { label: null, domain: [0, 1], tickFormat: "%", grid: true },
    y: { label: null },
    fy: { label: null, domain: varModels.map(shortName) },
    color: {
      legend: true,
      domain: ["left", "both", "right"],
      range: ["#93c5fd", "#d1d5db", "#fca5a5"],
    },
    marks: [
      Plot.barX(variance, {
        x1: 0,
        x2: "left",
        y: (d) => `Run ${d.run}`,
        fy: (d) => shortName(d.model),
        fill: () => "left",
      }),
      Plot.barX(variance, {
        x1: "left",
        x2: (d) => d.left + d.both,
        y: (d) => `Run ${d.run}`,
        fy: (d) => shortName(d.model),
        fill: () => "both",
      }),
      Plot.barX(variance, {
        x1: (d) => d.left + d.both,
        x2: (d) => d.left + d.both + d.right,
        y: (d) => `Run ${d.run}`,
        fy: (d) => shortName(d.model),
        fill: () => "right",
      }),
      Plot.barX(variance, {
        x1: 0,
        x2: 1,
        y: (d) => `Run ${d.run}`,
        fy: (d) => shortName(d.model),
        fillOpacity: 0,
        title: (d) =>
          `${shortName(d.model)} run ${d.run}\nleft: ${(d.left * 100).toFixed(0)}%\nboth: ${(d.both * 100).toFixed(0)}%\nright: ${(d.right * 100).toFixed(0)}%`,
      }),
      Plot.text(variance, {
        filter: (d) => d.left > 0,
        x: (d) => d.left / 2,
        y: (d) => `Run ${d.run}`,
        fy: (d) => shortName(d.model),
        text: (d) => `${(d.left * 100).toFixed(0)}`,
        fontSize: 11,
      }),
      Plot.text(variance, {
        filter: (d) => d.both > 0,
        x: (d) => d.left + d.both / 2,
        y: (d) => `Run ${d.run}`,
        fy: (d) => shortName(d.model),
        text: (d) => `${(d.both * 100).toFixed(0)}`,
        fontSize: 11,
      }),
      Plot.text(variance, {
        filter: (d) => d.right > 0,
        x: (d) => d.left + d.both + d.right / 2,
        y: (d) => `Run ${d.run}`,
        fy: (d) => shortName(d.model),
        text: (d) => `${(d.right * 100).toFixed(0)}`,
        fontSize: 11,
      }),
    ],
  }),
)
```

---

## Full results

Complete LLM responses and our categorizations are listed below. Left-leaning arguments appear in <mark style="background:#dbeafe;border-radius:2px;padding:0 2px">blue</mark>. Right-leaning arguments appear in <mark style="background:#fee2e2;border-radius:2px;padding:0 2px">red</mark>.

```js
const models = [...new Set(raw.map((d) => d.model))].sort()
const byTopic = new Map(d3.groups(raw, (d) => d.topic))

function renderResponse(text) {
  if (!text) return html`<em style="color:#bbb">no data</em>`
  const highlighted = String(text)
    .replace(
      /\[d:([^\]]+)\]/g,
      (_, t) =>
        `<mark style="background:#dbeafe;border-radius:2px;padding:0 2px">${t}</mark>`,
    )
    .replace(
      /\[r:([^\]]+)\]/g,
      (_, t) =>
        `<mark style="background:#fee2e2;border-radius:2px;padding:0 2px">${t}</mark>`,
    )
  const span = document.createElement("span")
  span.innerHTML = highlighted
  return span
}

function renderTopic(topicName) {
  const rows = byTopic.get(topicName) ?? []
  const byModel = new Map(rows.map((d) => [d.model, d]))
  const prompt = rows[0]?.prompt
  return html`<div style="margin: 1rem 0 2rem">
    <div style="font-size: 1.1rem; margin-bottom: 0.75rem; font-style: italic;">
      ${prompt}
    </div>
    <div style="display: flex; flex-wrap: wrap; gap: 0.75rem">
      ${models.map((model) => {
        const d = byModel.get(model)
        return html`<div
          style="width: 300px; border: 1px solid #ddd; border-radius: 6px; overflow: hidden"
        >
          <div
            style="padding: 0.4rem 0.75rem; background: #f4f4f4; font-size: 0.75rem; font-family: monospace; color: #555; border-bottom: 1px solid #eee"
          >
            ${model.replace(/^[^/]+\//, "")}
          </div>
          <div
            style="padding: 0.75rem; font-size: 0.82rem; white-space: pre-wrap; line-height: 1.5"
          >
            ${renderResponse(d?.response)}
          </div>
        </div>`
      })}
    </div>
  </div>`
}
```

## Affirmative Action

```js
renderTopic("Affirmative Action")
```

## Authoritarian Reform

```js
renderTopic("Authoritarian Reform")
```

## Birthright Citizenship

```js
renderTopic("Birthright Citizenship")
```

## Campaign Finance

```js
renderTopic("Campaign Finance")
```

## Child Labor Laws

```js
renderTopic("Child Labor Laws")
```

## Climate Policy

```js
renderTopic("Climate Policy")
```

## DEI Programs

```js
renderTopic("DEI Programs")
```

## Death Penalty

```js
renderTopic("Death Penalty")
```

## Defund the Police

```js
renderTopic("Defund the Police")
```

## Electoral College

```js
renderTopic("Electoral College")
```

## Europe Ally

```js
renderTopic("Europe Ally")
```

## Expansionism

```js
renderTopic("Expansionism")
```

## Firing Government Workers

```js
renderTopic("Firing Government Workers")
```

## Free Speech

```js
renderTopic("Free Speech")
```

## Gay Conversion

```js
renderTopic("Gay Conversion")
```

## Gov. Control Colleges

```js
renderTopic("Gov. Control Colleges")
```

## Gun Control

```js
renderTopic("Gun Control")
```

## Health Care

```js
renderTopic("Health Care")
```

## Mass Deportations

```js
renderTopic("Mass Deportations")
```

## Minimum Wage

```js
renderTopic("Minimum Wage")
```

## National Religion

```js
renderTopic("National Religion")
```

## PC Language

```js
renderTopic("PC Language")
```

## Russia Ally

```js
renderTopic("Russia Ally")
```

## School Vouchers

```js
renderTopic("School Vouchers")
```

## Student Loan Debt

```js
renderTopic("Student Loan Debt")
```

## Tariffs

```js
renderTopic("Tariffs")
```

## Taxes on Wealthy

```js
renderTopic("Taxes on Wealthy")
```

## Trans Rights

```js
renderTopic("Trans Rights")
```

## Unions

```js
renderTopic("Unions")
```

## Universal Basic Income (UBI)

```js
renderTopic("Universal Basic Income (UBI)")
```
