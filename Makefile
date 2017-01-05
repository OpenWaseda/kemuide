
default:
	make js/kemu.js

js/kemu.js: src/kuechip2.ts
	tsc src/kuechip2.ts --outFile js/kemu.js
