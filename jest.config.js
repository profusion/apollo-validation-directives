module.exports = {
  coveragePathIgnorePatterns: ['/node_modules/', '/build/'],
  moduleFileExtensions: ['ts', 'js'],
  modulePaths: ['<rootDir>/lib/'],
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/build/', 'test-utils.test.ts'],
};
