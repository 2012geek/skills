# Code Examples

## Python Example

```python
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)
```

## JavaScript Example

```javascript
const factorial = (n) => {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
};
```

## Bash Example

```bash
#!/bin/bash
echo "Hello, world!"
```

## Long Code Block

```javascript
// This is a longer code block to test
// code block handling and sizing

class ComplexCalculator {
  constructor(initialValue = 0) {
    this.value = initialValue;
    this.history = [];
  }

  add(number) {
    this.history.push({ operation: 'add', value: number });
    this.value += number;
    return this;
  }

  subtract(number) {
    this.history.push({ operation: 'subtract', value: number });
    this.value -= number;
    return this;
  }

  multiply(number) {
    this.history.push({ operation: 'multiply', value: number });
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
```
