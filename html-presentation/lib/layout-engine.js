/**
 * Layout Engine
 * Selects appropriate layouts based on content composition
 */

class LayoutEngine {
  constructor() {
    this.layouts = {
      'title': {
        name: 'title',
        description: 'Title slide with centered text',
        content: { text: 100, code: 0, image: 0 }
      },
      'section': {
        name: 'section',
        description: 'Section divider slide',
        content: { text: 100, code: 0, image: 0 }
      },
      'code-focus': {
        name: 'code-focus',
        description: 'Code-focused with some text',
        content: { text: 30, code: 70, image: 0 }
      },
      'code-full': {
        name: 'code-full',
        description: 'Full-screen code',
        content: { text: 0, code: 100, image: 0 }
      },
      'image-focus': {
        name: 'image-focus',
        description: 'Image-focused with some text',
        content: { text: 20, code: 0, image: 80 }
      },
      'image-full': {
        name: 'image-full',
        description: 'Full-screen image',
        content: { text: 0, code: 0, image: 100 }
      },
      'two-col': {
        name: 'two-col',
        description: 'Two columns: text and code',
        content: { text: 50, code: 50, image: 0 }
      },
      'image-right': {
        name: 'image-right',
        description: 'Text with image on right',
        content: { text: 60, code: 0, image: 40 }
      },
      'image-left': {
        name: 'image-left',
        description: 'Text with image on left',
        content: { text: 60, code: 0, image: 40 }
      },
      'two-col-image': {
        name: 'two-col-image',
        description: 'Three columns: text, code, image',
        content: { text: 30, code: 30, image: 40 }
      },
      'default': {
        name: 'default',
        description: 'Default text layout',
        content: { text: 100, code: 0, image: 0 }
      }
    };
  }

  selectLayout(metrics) {
    const { codeRatio = 0, imageRatio = 0, textRatio = 0, firstElementIsImage = false } = metrics;

    // Code-heavy slides (check more specific first)
    if (codeRatio >= 0.9) return 'code-full';
    if (codeRatio >= 0.6) return 'code-focus';

    // Image-heavy slides (check more specific first)
    if (imageRatio >= 0.9) return 'image-full';
    if (imageRatio >= 0.6) return 'image-focus';

    // Balanced content
    if (codeRatio >= 0.3 && imageRatio >= 0.2) return 'two-col-image';
    if (codeRatio >= 0.3) return 'two-col';
    if (imageRatio >= 0.3) {
      return firstElementIsImage ? 'image-left' : 'image-right';
    }

    return 'default';
  }

  getLayoutConfig(layoutName) {
    return this.layouts[layoutName];
  }

  listLayouts() {
    return Object.keys(this.layouts);
  }
}

module.exports = { LayoutEngine };
