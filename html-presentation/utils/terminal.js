const readline = require('readline');
const { spawn } = require('child_process');

/**
 * Terminal utilities for interactive CLI operations
 */
class Terminal {
  /**
   * Prompt user for input
   * @param {string} question - Question to display
   * @returns {Promise<string>} User input
   */
  static async prompt(question) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(question, (input) => {
        rl.close();
        resolve(input.trim());
      });
    });
  }

  /**
   * Display a menu and get user choice
   * @param {string} title - Menu title
   * @param {Array} options - Array of option strings
   * @returns {Promise<number>} Selected option index (1-based)
   */
  static async menu(title, options) {
    console.log(`\n=== ${title} ===\n`);

    options.forEach((option, index) => {
      console.log(`${index + 1}. ${option}`);
    });

    const answer = await this.prompt('\n请输入选项: ');
    const choice = parseInt(answer, 10);

    if (isNaN(choice) || choice < 1 || choice > options.length) {
      console.log('无效选项，请重新选择');
      return this.menu(title, options);
    }

    return choice;
  }

  /**
   * Confirm yes/no question
   * @param {string} question - Question to confirm
   * @returns {Promise<boolean>} True if yes
   */
  static async confirm(question) {
    const answer = await this.prompt(`${question} (y/n): `);
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  }

  /**
   * Open editor with file
   * @param {string} filepath - Path to file
   * @returns {Promise<void>}
   */
  static async editFile(filepath) {
    const editor = process.env.EDITOR || 'nano';

    return new Promise((resolve, reject) => {
      const proc = spawn(editor, [filepath], {
        stdio: 'inherit'
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Editor exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Clear screen
   */
  static clear() {
    console.clear();
  }

  /**
   * Display header
   * @param {string} text - Header text
   */
  static header(text) {
    console.log('\n' + '='.repeat(50));
    console.log(`  ${text}`);
    console.log('='.repeat(50) + '\n');
  }

  /**
   * Display success message
   * @param {string} message - Message to display
   */
  static success(message) {
    console.log(`✓ ${message}`);
  }

  /**
   * Display error message
   * @param {string} message - Message to display
   */
  static error(message) {
    console.error(`✗ ${message}`);
  }

  /**
   * Display warning message
   * @param {string} message - Message to display
   */
  static warn(message) {
    console.warn(`⚠ ${message}`);
  }

  /**
   * Display info message
   * @param {string} message - Message to display
   */
  static info(message) {
    console.log(`ℹ ${message}`);
  }

  /**
   * Display a table
   * @param {Array<Array>} rows - Table rows
   * @param {Array<string>} headers - Column headers
   */
  static table(headers, rows) {
    const widths = headers.map((h, i) => {
      const maxWidth = Math.max(
        h.length,
        ...rows.map(row => String(row[i] || '').length)
      );
      return maxWidth + 2;
    });

    // Print header
    console.log();
    headers.forEach((h, i) => {
      process.stdout.write(h.padEnd(widths[i]));
    });
    console.log();

    // Print separator
    headers.forEach((_, i) => {
      process.stdout.write('-'.repeat(widths[i] - 1) + ' ');
    });
    console.log();

    // Print rows
    rows.forEach(row => {
      row.forEach((cell, i) => {
        process.stdout.write(String(cell || '').padEnd(widths[i]));
      });
      console.log();
    });
    console.log();
  }
}

module.exports = { Terminal };
