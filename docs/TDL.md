# Technical Decisions Log

This log records decisions that shape the plugin's architecture — the ones that are hard to
reverse once other code depends on them, not local implementation or style choices. Each entry is
a Y-statement: context, the quality being sought, what we decided (and against what), the benefit,
and the tradeoff accepted.

## 1. Copyeditor as a business-logic layer

In the context of implementing the plugin's operations (e.g. generating style cards),
facing the need to keep business logic testable and independent of Obsidian's UI and Vault APIs,
we decided for a Copyeditor class that depends only on a Client and works purely with
already-resolved inputs and business-level outputs,
and against building prompt orchestration directly into views, or letting Copyeditor read files
or write output itself,
to achieve a clear separation between business logic and UI/IO concerns,
accepting that views must resolve all file contents and UI state themselves before calling in.

## 2. Client as a vendor-neutral facade over the Anthropic SDK

In the context of calling Claude for prompts, cost estimates, and model capabilities,
facing the risk of Anthropic-specific SDK shapes leaking into business logic and UI code,
we decided for a Client facade that owns the Anthropic SDK privately and exposes only
`prompt()`, `listModelOptions()`, and `estimateCost()` through its own vendor-neutral types,
and against calling Anthropic directly or exposing its raw types (capabilities, usage, content
blocks) elsewhere in the plugin,
to achieve one place responsible for all Claude-specific translation, including how thinking
mode is implemented, that could support other providers later,
accepting that Client still hardcodes Anthropic-specific pricing and model data that will need
upkeep as Anthropic's models and API shapes change.
