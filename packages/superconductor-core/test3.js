console.log("1. foo in foo-bar:", new RegExp('(?<![\\w-])foo(?![\\w-])').test('## [x] Track foo-bar'));
console.log("2. -foo in -foo:", new RegExp('(?<![\\w-])-foo(?![\\w-])').test('## [x] Track -foo'));
console.log("3. foo-bar in foo-bar:", new RegExp('(?<![\\w-])foo-bar(?![\\w-])').test('## [x] Track foo-bar'));
