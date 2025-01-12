export class JsonBuilder {
  private jsonObject: Record<string, any>;

  constructor(initialObject: Record<string, any> = {}) {
    this.jsonObject = initialObject;
  }

  // 키-값 추가
  addData(key: string, value: any): JsonBuilder {
    this.jsonObject[key] = value;
    return this; // 메서드 체이닝 지원
  }

  // 배열에 데이터 추가
  addToArray(key: string, value: any): JsonBuilder {
    if (!Array.isArray(this.jsonObject[key])) {
      this.jsonObject[key] = [];
    }
    this.jsonObject[key].push(value);
    return this;
  }

  // JSON 반환
  getJson(): Record<string, any> {
    return this.jsonObject;
  }

  // JSON 문자열 반환
  toString(): string {
    return JSON.stringify(this.jsonObject, null, 2);
  }
}
