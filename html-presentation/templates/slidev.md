---
theme: seriph
background: https://source.unsplash.com/collection/94734566/1920x1080
class: text-center
highlighter: shiki
lineNumbers: true
info: |
  ## Slidev Starter Template
  Presentation slides for developers.
drawings:
  persist: false
transition: slide
title: Slidev Starter Template
mdc: true
---

# Slidev Starter Template

Presentation slides for developers

<div class="pt-12">
  <span @click="$slidev.nav.next" class="px-2 py-1 rounded cursor-pointer" hover="bg-white bg-opacity-10">
    Press Space for next page <carbon:arrow-right class="inline"/>
  </span>
</div>

<div class="abs-br m-6 flex gap-2">
  <span class="text-sm opacity-50">Slidev Starter Template</span>
  <a href="https://github.com/slidevjs/slidev" target="_blank" alt="GitHub"
    class="text-sm icon-btn opacity-50 !border-none !hover:text-white">
    <carbon-logo-github />
  </a>
</div>

---
transition: fade-out
---

# What is Slidev?

Slidev is a slides maker and presenter designed for developers, based on **Markdown** and **Vue.js**.

<br>
<br>

<v-click>

Characteristics:

- 📝 **Text-based** - focus on the content and manage everything in markdown files
- 🎨 **Themable** - theme can be customized and used with CSS
- 🧑‍💻 **Developer Friendly** - code highlighting, live coding with autocompletion
- 🤹 **Interactive** - embedding Vue components to enhance your presentation
- 🎥 **Recording** - built-in recording and camera view
- 📤 **Portable** - export to PDF, PNGs, or a hostable SPA
- 🌐 **Internet Ready** - can be deployed anywhere, and stream your slides

</v-click>

<br>
<br>

<v-click>

<span id="hero">Try it out!</span>

```js
console.log('Hello, Slidev!')
```

</v-click>

---
layout: two-cols
---

# Columns Layout

<div class="pl-4">

<v-clicks>

- Left column
- Content here
- Can have
- Multiple items

</v-clicks>

</div>

::right::

<div class="pl-4">

<v-clicks>

- Right column
- Content here
- Synced with
- Left column

</v-clicks>

</div>

---
layout: image-right
image: https://source.unsplash.com/collection/94734566/800x600
---

# Code Blocks

Use ````js` or ` ```ts` for syntax highlighting.

```js
// This is a code block
function hello() {
  console.log('Hello, Slidev!');
}
```

<br>

<v>

[Official Docs](https://sli.dev/guide/syntax.html)

</v>

---
layout: center
class: text-center
---

# Learn More

[Documentation](https://sli.dev) · [GitHub](https://github.com/slidevjs/slidev) · [Showcases](https://sli.dev/showcases.html)
