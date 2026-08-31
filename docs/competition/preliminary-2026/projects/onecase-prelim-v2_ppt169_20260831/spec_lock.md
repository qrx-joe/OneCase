# Execution Lock

## canvas
- viewBox: 0 0 1280 720
- format: PPT 16:9

## mode
- mode: narrative

## visual_style
- visual_style: editorial

## colors
- bg: #FAFAF7
- secondary_bg: #F0F2ED
- primary: #1E4D40
- accent: #D97B29
- secondary_accent: #5E8C7B
- text: #22302B
- text_secondary: #5C6B64
- text_tertiary: #8A968F
- border: #D8DED6
- grid: #E4E8E1
- success: #2E7D5B
- warning: #B5442E

## typography
- font_family: 'Microsoft YaHei', Arial, sans-serif
- title_family: Georgia, SimSun, serif
- code_family: Consolas, 'Courier New', monospace
- body: 24
- cover_title: 72
- hero_headline: 68
- hero_number: 48
- title: 42
- subtitle: 32
- lead: 28
- annotation: 18
- footnote: 16

## icons
- library: tabler-outline
- stroke_width: 2
- inventory: messages, users, user, arrows-split-2, link, circle-check, checklist, alert-triangle, refresh, cpu, database, shield-check, chart-bar, coins, file-text, route, map-pin, pencil, settings, stairs, scale, flag, target, bolt, home

## page_rhythm
- P01: anchor
- P02: dense
- P03: dense
- P04: breathing
- P05: dense
- P06: dense
- P07: dense
- P08: dense
- P09: dense
- P10: dense
- P11: dense
- P12: dense
- P13: dense
- P14: anchor

## page_charts
- P02: vertical_list
- P03: labeled_card
- P06: numbered_steps
- P07: quadrant_text_bullets
- P08: layered_architecture
- P09: kpi_cards
- P10: chevron_process
- P11: vertical_pillars
- P12: roadmap_vertical
- P13: basic_table

## forbidden
- Mixing icon libraries
- rgba()
- `<style>`, `class`, `<foreignObject>`, `textPath`, `@font-face`, `<animate*>`, `<script>`, `<iframe>`, `<symbol>`+`<use>`
- `<g opacity>` (set opacity on each child element individually)
- HTML named entities in text (`&nbsp;`, `&mdash;`, `&copy;`, `&ndash;`, `&reg;`, `&hellip;`, `&bull;` …) — write as raw Unicode (`—`, `©`, `→`, NBSP, etc.); XML reserved chars `& < > " '` must be escaped as `&amp; &lt; &gt; &quot; &apos;`
