const { Terminal } = require('../utils/terminal');
const fs = require('fs').promises;

/**
 * Handles human intervention when auto-fix fails
 */
class HumanIntervention {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Handle failed auto-fix with user interaction
   * @param {string} markdown - Slide markdown
   * @param {Array} attemptHistory - Attempt history
   * @returns {Promise<Object>} Result object
   */
  async handle(markdown, attemptHistory) {
    this.displayFailureReport(attemptHistory);
    const choice = await this.promptUser();

    switch (choice.action) {
      case 'skip':
        return this.skip(markdown, attemptHistory);

      case 'edit':
        return await this.edit(markdown, attemptHistory);

      case 'view':
        await this.viewScreenshots(attemptHistory);
        return await this.handle(markdown, attemptHistory);

      case 'layout':
        return await this.applyLayout(markdown, choice.layout);

      case 'defer':
        return this.defer(markdown, attemptHistory);

      default:
        return this.skip(markdown, attemptHistory);
    }
  }

  /**
   * Display failure report
   * @param {Array} history - Attempt history
   */
  displayFailureReport(history) {
    Terminal.header('自动修复失败');

    console.log(`尝试次数: ${history.length}`);

    const validScores = history.filter(h => h.score !== undefined);
    if (validScores.length > 0) {
      const maxScore = Math.max(...validScores.map(h => h.score));
      const threshold = this.options.threshold || 80;
      console.log(`最高分数: ${maxScore}/100 (阈值: ${threshold})`);
    }

    console.log('\n=== 尝试历史 ===');
    history.forEach((attempt, i) => {
      console.log(`\n[尝试 ${i + 1}]`);
      console.log(`  方案: ${attempt.approach || 'unknown'}`);
      if (attempt.score !== undefined) {
        console.log(`  分数: ${attempt.score}/100`);
      }
      if (attempt.issues && attempt.issues.length > 0) {
        console.log(`  问题: ${attempt.issues.join(', ')}`);
      }
      if (attempt.error) {
        console.log(`  错误: ${attempt.error}`);
      }
    });
  }

  /**
   * Prompt user for action
   * @returns {Promise<Object>} User choice
   */
  async promptUser() {
    const options = [
      '跳过此幻灯片，使用当前版本',
      '手动编辑 Markdown',
      '查看所有尝试的截图',
      '尝试特定布局（指定布局名称）',
      '标记为"已知问题"，稍后处理'
    ];

    const choice = await Terminal.menu('请选择处理方式', options);

    // Handle layout option with custom input
    if (choice === 4) {
      const layout = await Terminal.prompt('请输入布局名称 (如: center, cover, two-cols): ');
      return { action: 'layout', layout };
    }

    const actionMap = {
      1: 'skip',
      2: 'edit',
      3: 'view',
      5: 'defer'
    };

    return { action: actionMap[choice] };
  }

  /**
   * Skip this slide, use current version
   * @param {string} markdown - Slide markdown
   * @param {Array} history - Attempt history
   * @returns {Object} Result
   */
  skip(markdown, history) {
    Terminal.info('跳过幻灯片，使用当前版本');

    return {
      markdown: markdown,
      success: false,
      skipped: true,
      attempts: history
    };
  }

  /**
   * Edit markdown manually
   * @param {string} markdown - Slide markdown
   * @param {Array} history - Attempt history
   * @returns {Promise<Object>} Result
   */
  async edit(markdown, history) {
    const tempFile = `/tmp/slide-edit-${Date.now()}.md`;
    await fs.writeFile(tempFile, markdown);

    console.log(`\n正在打开编辑器: ${tempFile}`);
    Terminal.info('编辑完成后保存并退出编辑器\n');

    try {
      await Terminal.editFile(tempFile);
      const edited = await fs.readFile(tempFile, 'utf-8');

      Terminal.success('编辑完成');

      return {
        markdown: edited,
        success: true,
        manual: true,
        attempts: history
      };
    } catch (error) {
      Terminal.error(`编辑失败: ${error.message}`);
      return this.skip(markdown, history);
    }
  }

  /**
   * View screenshots from attempts
   * @param {Array} history - Attempt history
   * @returns {Promise<void>}
   */
  async viewScreenshots(history) {
    const open = require('open').open;

    Terminal.info('正在打开截图...\n');

    for (const attempt of history) {
      if (attempt.screenshot) {
        try {
          await open(attempt.screenshot);
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          Terminal.warn(`无法打开截图: ${attempt.screenshot}`);
        }
      }
    }

    Terminal.info('按回车键继续...');
    await Terminal.prompt('');
  }

  /**
   * Apply specific layout
   * @param {string} markdown - Slide markdown
   * @param {string} layout - Layout name
   * @returns {Promise<Object>} Result
   */
  async applyLayout(markdown, layout) {
    Terminal.info(`应用布局: ${layout}`);

    // Check if markdown already has frontmatter
    const hasFrontmatter = markdown.startsWith('---');
    let newMarkdown;

    if (hasFrontmatter) {
      // Update existing frontmatter
      const lines = markdown.split('\n');
      const frontmatterEnd = lines.indexOf('---', 1);

      if (frontmatterEnd > 0) {
        // Check if layout already exists
        let layoutInserted = false;
        for (let i = 1; i < frontmatterEnd; i++) {
          if (lines[i].startsWith('layout:')) {
            lines[i] = `layout: ${layout}`;
            layoutInserted = true;
            break;
          }
        }

        if (!layoutInserted) {
          lines.splice(frontmatterEnd, 0, `layout: ${layout}`);
        }

        newMarkdown = lines.join('\n');
      } else {
        newMarkdown = markdown;
      }
    } else {
      // Add new frontmatter
      newMarkdown = `---\nlayout: ${layout}\n---\n\n${markdown}`;
    }

    return {
      markdown: newMarkdown,
      success: false,
      needsVerification: true,
      attempts: []
    };
  }

  /**
   * Defer handling
   * @param {string} markdown - Slide markdown
   * @param {Array} history - Attempt history
   * @returns {Object} Result
   */
  defer(markdown, history) {
    Terminal.warn('幻灯片已标记为"已知问题"，稍后处理');

    return {
      markdown: markdown,
      success: false,
      deferred: true,
      attempts: history
    };
  }
}

module.exports = { HumanIntervention };
