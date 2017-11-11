
default:
	make js/kemu.js

js/kemu.js: src/kuechip2.ts
	tsc src/kuechip2.ts --out js/kemu.js
