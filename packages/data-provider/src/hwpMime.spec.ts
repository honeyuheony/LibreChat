import { hasTextExtractionPath, resolveDefaultLLMDeliveryPath } from './resolve-llm-delivery-path';
import {
  documentParserMimeTypes,
  fileConfig,
  inferMimeType,
  supportedMimeTypes,
} from './file-config';

const browserMimeTypes = [
  '',
  'application/octet-stream',
  'application/x-hwp',
  'application/haansofthwp',
  'application/vnd.hancom.hwpx',
  'application/hwp+zip',
];

describe('HWP MIME handling', () => {
  test.each([
    ...browserMimeTypes.map((mimeType) => ['report.hwp', mimeType, 'application/x-hwp']),
    ...browserMimeTypes.map((mimeType) => ['report.hwpx', mimeType, 'application/hwp+zip']),
  ])('normalizes %s with browser MIME %s', (filename, currentType, expectedMimeType) => {
    expect(inferMimeType(filename, currentType)).toBe(expectedMimeType);
  });

  test.each(['application/x-hwp', 'application/hwp+zip'])(
    'allows %s on the document parser path',
    (mimeType) => {
      expect(fileConfig.checkType(mimeType, supportedMimeTypes)).toBe(true);
      expect(documentParserMimeTypes.some((pattern) => pattern.test(mimeType))).toBe(true);
      expect(hasTextExtractionPath(mimeType)).toBe(true);
      expect(resolveDefaultLLMDeliveryPath(mimeType)).toBe('text');
    },
  );
});
