---
theme: seriph
title: Presentation
author: 
class: text-left
highlighter: shiki
lineNumbers: false
drawings:
  persist: false
transition: slide-left
titleTemplate: '%s'
---

---
layout: default
---

## Python Example

<pre><code class="language-python">def factorial(n):
    if n &lt;= 1:
        return 1
    return n * factorial(n - 1)
</code></pre>


---

---
layout: default
---

## JavaScript Example

<pre><code class="language-javascript">const factorial = (n) =&gt; {
  if (n &lt;= 1) return 1;
  return n * factorial(n - 1);
};
</code></pre>


---

---
layout: default
---

## Bash Example

<pre><code class="language-bash">#!/bin/bash
echo &quot;Hello, world!&quot;
</code></pre>


---

---
layout: default
---

## Long Code Block

<pre><code class="language-javascript">// This is a longer code block to test
// code block handling and sizing

class ComplexCalculator {
  constructor(initialValue = 0) {
    this.value = initialValue;
    this.history = [];
  }

  add(number) {
    this.history.push({ operation: &#39;add&#39;, value: number });
    this.value += number;
    return this;
  }

  subtract(number) {
    this.history.push({ operation: &#39;subtract&#39;, value: number });
    this.value -= number;
    return this;
  }

  multiply(number) {
    this.history.push({ operation: &#39;multiply&#39;, value: number });
    this.value *= number;
    return this;
  }

  getResult() {
    return this.value;
  }

  getHistory() {
    return this.history;
  }

  reset() {
    this.value = 0;
    this.history = [];
    return this;
  }
}

// Usage example
const calc = new ComplexCalculator(10);
const result = calc.add(5).multiply(2).subtract(3).getResult();
console.log(result); // 27
console.log(calc.getHistory());
</code></pre>
