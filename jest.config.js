module.exports = {
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/build/',
    'lib/test-utils.test.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  moduleFileExtensions: ['ts', 'js'],
  modulePaths: ['<rootDir>/lib/'],
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/build/', 'test-utils.test.ts'],
};
