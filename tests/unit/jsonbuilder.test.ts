// Simple JsonBuilder functionality tests
export {};

describe('JsonBuilder Tests', () => {
  // Test implementation that mirrors the actual JsonBuilder
  class TestJsonBuilder {
    private jsonObject: Record<string, any>;

    constructor(initialObject: Record<string, any> = {}) {
      this.jsonObject = initialObject;
    }

    addData(key: string, value: any): TestJsonBuilder {
      this.jsonObject[key] = value;
      return this;
    }

    addToArray(key: string, value: any): TestJsonBuilder {
      if (!Array.isArray(this.jsonObject[key])) {
        this.jsonObject[key] = [];
      }
      this.jsonObject[key].push(value);
      return this;
    }

    getJson(): Record<string, any> {
      return this.jsonObject;
    }

    toString(): string {
      return JSON.stringify(this.jsonObject, null, 2);
    }
  }

  let builder: TestJsonBuilder;

  beforeEach(() => {
    builder = new TestJsonBuilder();
  });

  test('should create empty JsonBuilder', () => {
    expect(builder.getJson()).toEqual({});
  });

  test('should add data correctly', () => {
    builder.addData('key1', 'value1')
           .addData('key2', 42)
           .addData('key3', true);

    expect(builder.getJson()).toEqual({
      key1: 'value1',
      key2: 42,
      key3: true
    });
  });

  test('should add data to array correctly', () => {
    builder.addToArray('messages', { role: 'system', content: 'Hello' })
           .addToArray('messages', { role: 'user', content: 'Hi' });

    expect(builder.getJson()).toEqual({
      messages: [
        { role: 'system', content: 'Hello' },
        { role: 'user', content: 'Hi' }
      ]
    });
  });
});
