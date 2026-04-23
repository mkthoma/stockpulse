export class HistoryManager {
  constructor() {
    this.history = [];
  }

  addUser(text) {
    this.history.push({ role: 'user', parts: [{ text }] });
  }

  addModel(parts) {
    this.history.push({ role: 'model', parts });
  }

  // All tool results for a single turn go in ONE 'user' content item.
  // Each response must be a proto Struct (object) — arrays are not allowed.
  addToolResults(results) {
    const parts = results.map(({ name, response }) => ({
      functionResponse: {
        name,
        response: this._toStruct(response)
      }
    }));
    this.history.push({ role: 'user', parts });
  }

  get() {
    return this.history;
  }

  reset() {
    this.history = [];
  }

  // Gemini's functionResponse.response must be a JSON object (proto Struct).
  // Wrap arrays under an "output" key; pass objects through as-is.
  _toStruct(value) {
    if (Array.isArray(value))              return { output: value };
    if (value && typeof value === 'object') return value;
    return { output: value };
  }
}
