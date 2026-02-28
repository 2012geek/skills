/**
 * Semantic cache implementation (simplified version)
 * For production, would use vector similarity search (e.g., TF-IDF, embeddings)
 */
class SemanticCache {
  constructor(options = {}) {
    this.threshold = options.threshold || 0.85;
    this.cache = new Map(); // key -> { value, metadata, keywords }
    this.keywordIndex = new Map(); // keyword -> Set of keys
  }

  /**
   * Extract keywords from text
   * @param {string} text - Input text
   * @returns {Set<string>} Keywords
   */
  extractKeywords(text) {
    // Simple keyword extraction (could be enhanced with NLP)
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3); // Filter short words

    const stopWords = new Set([
      'this', 'that', 'with', 'from', 'have', 'they', 'will', 'would',
      'there', 'their', 'what', 'about', 'which', 'when', 'make', 'time'
    ]);

    const keywords = new Set();
    for (const word of words) {
      if (!stopWords.has(word)) {
        keywords.add(word);
      }
    }

    return keywords;
  }

  /**
   * Calculate similarity between two key sets using Jaccard index
   * @param {Set<string>} keywords1 - First keyword set
   * @param {Set<string>} keywords2 - Second keyword set
   * @returns {number} Similarity score (0-1)
   */
  calculateSimilarity(keywords1, keywords2) {
    const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));
    const union = new Set([...keywords1, ...keywords2]);

    if (union.size === 0) return 0;

    return intersection.size / union.size;
  }

  /**
   * Index a cache entry
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {Object} metadata - Optional metadata
   */
  async index(key, value, metadata = {}) {
    const keywords = this.extractKeywords(key);

    // Store entry
    this.cache.set(key, {
      value,
      metadata,
      keywords
    });

    // Update keyword index
    for (const keyword of keywords) {
      if (!this.keywordIndex.has(keyword)) {
        this.keywordIndex.set(keyword, new Set());
      }
      this.keywordIndex.get(keyword).add(key);
    }
  }

  /**
   * Find semantically similar entry
   * @param {string} key - Search key
   * @returns {Promise<any|null>} Similar value or null
   */
  async findSimilar(key) {
    const keywords = this.extractKeywords(key);
    const candidates = new Set();

    // Find candidates through keyword index
    for (const keyword of keywords) {
      const keys = this.keywordIndex.get(keyword);
      if (keys) {
        for (const candidateKey of keys) {
          if (candidateKey !== key) {
            candidates.add(candidateKey);
          }
        }
      }
    }

    // Find best match
    let bestMatch = null;
    let bestScore = 0;

    for (const candidateKey of candidates) {
      const entry = this.cache.get(candidateKey);
      if (entry) {
        const score = this.calculateSimilarity(keywords, entry.keywords);
        if (score > bestScore && score >= this.threshold) {
          bestScore = score;
          bestMatch = entry.value;
        }
      }
    }

    return bestMatch || null;
  }

  /**
   * Get value by exact key
   * @param {string} key - Cache key
   * @returns {any|null} Value or null
   */
  get(key) {
    const entry = this.cache.get(key);
    return entry ? entry.value : null;
  }

  /**
   * Clear all entries
   */
  async clear() {
    this.cache.clear();
    this.keywordIndex.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      entries: this.cache.size,
      keywords: this.keywordIndex.size,
      avgKeywordsPerEntry: this.cache.size > 0
        ? Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.keywords.size, 0) / this.cache.size
        : 0
    };
  }
}

module.exports = { SemanticCache };
