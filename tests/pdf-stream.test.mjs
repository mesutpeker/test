import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPageText } from '../lib/pdf-engine.ts';

test('PDF text remains readable without ReadableStream async iteration', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(ReadableStream.prototype, Symbol.asyncIterator);
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, { configurable: true, value: undefined });
  try {
    let calls = 0;
    let stream;
    const page = { streamTextContent() {
      calls++;
      stream = new ReadableStream({ start(controller) {
        controller.enqueue({ items: [{ str: 'Birinci soru' }], styles: { F1: { fontFamily: 'sans-serif' } }, lang: 'tr' });
        controller.enqueue({ items: [{ str: 'A) Yanıt' }], styles: {}, lang: null });
        controller.close();
      }});
      return stream;
    }};
    const pending = readPageText(page);
    assert.equal(readPageText(page), pending, 'Concurrent measurements share one stream');
    const text = await pending;
    assert.deepEqual(text.items.map(item => item.str), ['Birinci soru', 'A) Yanıt']);
    assert.equal(text.lang, 'tr');
    assert.equal(text.styles.F1.fontFamily, 'sans-serif');
    assert.equal(stream.locked, false, 'Reader lock is released');
    assert.equal(calls, 1);
  } finally {
    if (descriptor) Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, descriptor);
    else delete ReadableStream.prototype[Symbol.asyncIterator];
  }
});

test('An interrupted text stream releases its lock and can be retried', async () => {
  let calls = 0;
  let stream;
  const page = { streamTextContent() {
    calls++;
    stream = new ReadableStream({ start(controller) {
      if (calls === 1) controller.error(new Error('Interrupted stream'));
      else { controller.enqueue({ items: [{ str: 'Recovered' }], styles: {}, lang: null }); controller.close(); }
    }});
    return stream;
  }};
  await assert.rejects(readPageText(page), /Interrupted stream/);
  assert.equal(stream.locked, false);
  assert.equal((await readPageText(page)).items[0].str, 'Recovered');
  assert.equal(calls, 2);
});
