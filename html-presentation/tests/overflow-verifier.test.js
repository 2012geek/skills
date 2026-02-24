const SlideVerifier = require('../scripts/overflow-verifier');

describe('SlideVerifier', () => {
  let verifier;

  beforeEach(async () => {
    verifier = new SlideVerifier({
      port: 3031,
      timeout: 15000
    });
  });

  afterEach(async () => {
    if (verifier) {
      await verifier.cleanup();
    }
  });

  test('should start server and capture screenshot', async () => {
    const result = await verifier.verify('# Test Slide\n\nContent here');
    expect(result.screenshot).toBeInstanceOf(Uint8Array);
    expect(result.screenshot.length).toBeGreaterThan(1000);
    expect(result.basicInfo.title).toBe('Test Slide');
  }, 30000);

  test('should detect overflow in basic info', async () => {
    // Create content that will overflow a single slide
    const longContent = 'This is a very long line of text that will continue and continue and eventually cause the slide to overflow. '.repeat(100);
    const result = await verifier.verify(longContent);
    expect(result.basicInfo.vOverflow).toBe(true);
  }, 30000);
});
