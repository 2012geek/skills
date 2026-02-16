/**
 * Theme Manager
 * Manages and recommends Slidev community themes
 */

class ThemeManager {
  constructor() {
    this.officialThemes = [
      {
        name: 'seriph',
        package: '@slidev/theme-seriph',
        style: 'professional',
        bestFor: ['mixed', 'business', 'technical'],
        description: 'Elegant professional theme for mixed content'
      },
      {
        name: 'default',
        package: '@slidev/theme-default',
        style: 'minimal',
        bestFor: ['code', 'technical'],
        description: 'Minimal style, great for code'
      },
      {
        name: 'apple-basic',
        package: '@slidev/theme-apple-basic',
        style: 'modern',
        bestFor: ['business', 'design'],
        description: 'Apple-style, modern and clean'
      }
    ];

    this.communityThemes = [
      {
        name: 'shibainu',
        package: '@slidev/theme-shibainu',
        style: 'playful',
        bestFor: ['casual', 'creative'],
        install: 'npm install @slidev/theme-shibainu',
        description: 'Cute playful style'
      },
      {
        name: 'dracula',
        package: '@slidev/theme-dracula',
        style: 'dark',
        bestFor: ['code', 'technical'],
        install: 'npm install @slidev/theme-dracula',
        description: 'Dracula dark theme, code-friendly'
      }
    ];

    this.themeConfigs = {
      seriph: {
        frontmatter: {
          theme: 'seriph',
          highlighter: 'shiki',
          lineNumbers: false,
          class: 'text-left'
        },
        cssOverrides: `
/* Chinese optimization */
.slide-content {
  line-height: 1.8;
  letter-spacing: 0.02em;
}

/* Code block optimization */
pre {
  font-size: 0.85em;
  max-height: 400px;
  overflow-y: auto;
}

/* Image optimization */
img {
  max-height: 450px;
  object-fit: contain;
}
        `
      },
      default: {
        frontmatter: {
          theme: 'default',
          highlighter: 'shiki',
          lineNumbers: false
        },
        cssOverrides: `
.slide-content {
  line-height: 1.6;
}

pre {
  font-size: 0.9em;
  max-height: 450px;
}
        `
      },
      dracula: {
        frontmatter: {
          theme: 'dracula',
          highlighter: 'shiki',
          lineNumbers: true
        },
        cssOverrides: `
pre {
  font-size: 0.85em;
  max-height: 500px;
}
        `
      }
    };
  }

  recommendThemes(metrics) {
    const recommendations = [];
    const { codeRatio = 0, imageRatio = 0, textRatio = 0 } = metrics;

    // Code-heavy → Dark theme
    if (codeRatio >= 0.5) {
      recommendations.push({
        name: 'dracula',
        theme: 'dracula',
        package: '@slidev/theme-dracula',
        reason: 'Dark theme highlights code syntax',
        priority: 'high'
      });
    }

    // Image-heavy → Light theme
    if (imageRatio >= 0.5) {
      recommendations.push({
        name: 'seriph',
        theme: 'seriph',
        package: '@slidev/theme-seriph',
        reason: 'Elegant theme with great image presentation',
        priority: 'high'
      });
    }

    // Mixed content → Balanced theme
    if (codeRatio >= 0.2 && imageRatio >= 0.2) {
      recommendations.push({
        name: 'seriph',
        theme: 'seriph',
        package: '@slidev/theme-seriph',
        reason: 'Current theme, suitable for mixed content',
        priority: 'high'
      });
    }

    // Text-heavy → Minimal theme
    if (textRatio > 0.7) {
      recommendations.push({
        name: 'default',
        theme: 'default',
        package: '@slidev/theme-default',
        reason: 'Minimal theme focuses on content',
        priority: 'medium'
      });
    }

    return recommendations.length > 0 ? recommendations : [
      {
        name: 'seriph',
        theme: 'seriph',
        package: '@slidev/theme-seriph',
        reason: 'Good default theme for most content',
        priority: 'low'
      }
    ];
  }

  getThemeConfig(themeName) {
    const config = this.themeConfigs[themeName] || this.themeConfigs['default'];
    return {
      theme: themeName,
      ...config
    };
  }

  listThemes() {
    const official = this.officialThemes.map(t => t.name);
    const community = this.communityThemes.map(t => t.name);
    return [...official, ...community];
  }

  getThemeInfo(themeName) {
    return this.officialThemes.find(t => t.name === themeName) ||
           this.communityThemes.find(t => t.name === themeName);
  }
}

module.exports = { ThemeManager };
