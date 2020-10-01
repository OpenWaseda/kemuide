/*
 * kemu (pronounced KM) - by yasuo ozu
 * distributed under the MIT license.
 **/

;(function(window){
	var KasmException = function(message, val) {
		this.message = message;
		this.name = "KasmException";
		this.val = val !== undefined ? val : 0;
	}
	KasmException.prototype.toString = function(){
		return this.message + "\n";
	};
	//
	var kemuAssembler = function(){
		this.message = function(){};
		this.binary = [];
	};
	kemuAssembler.prototype = {
		warning: function(){},
		error: function(){},
		tokenize: function(line) {
			var a = [], i = 0, c;
			c = line[i++];
			while (true) {
				while (i <= line.length && c.match(/\s/)) c = line[i++];
				if (i > line.length || c == '#' || c == '*') break;
				if (c.match(/[A-Za-z_]/)) {
					var s = "";
					do {
						s += c;
						c = line[i++];
					} while (i <= line.length && c.match(/[A-Za-z0-9_]/));
					a.push(s.toUpperCase());
				} else if (c.match(/[0-9]/)) {
					var s = "";
					do {
						s += c;
						c = line[i++];
					} while (i <= line.length && c.match(/[0-9A-Fa-f]/));
					if ("Hh".indexOf(c) != -1) {
						a.push(parseInt(s, 16));
						s += c;
						c = line[i++];
					} else {
						if (s.match(/[A-Fa-f]/)) 
							throw new KasmException("'" + s + "' は正しい数値の表記ではありません。16進数なら末尾に'H'をつける必要があります。");
						a.push(parseInt(s, 10));
					}
					if (i <= line.length && c.match(/[A-Za-z0-9_]/)) throw new KasmException("'" + s + c + "' は正しい数値の表記ではありません");
				} else if (",:+-()[]/*".indexOf(c) != -1) {
					a.push(c);
					c = line[i++];
				} else {
					throw new KasmException("'" + c + "' (文字コード: " + c.charCodeAt(0) + ") は認識できません。間違って全角文字を使用していませんか?");
				}
			}
			return a;
		},
		calculate: function calculate(token, p) {
			var i, var1, var2;
			if (p == 2) {
				if (token.length == 0) return 0;	// left operand of single '+', '-'
				if (token[0] == "(") {
					if (token[token.length - 1] != ")") 
						throw new KasmException("式の括弧が対応していません");
					return calculate(token.slice(1, token.length - 1), 0);
				} else {
					if (token.length != 1) {
						throw new KasmException("式に余分な項があります", 1);
					}
					if (typeof token[0] != "number") {
						if (token.length == 1) {
							if (token.length == 1 && "Hh".indexOf(token[0][token[0].length-1]) != -1)
								throw new KasmException("'" + token[0] + "' は正しい数値の表記ではありません。直前に'0'を補ってください");
							else throw new KasmException("'" + token[0] + "' は定義されていません");
						}
						else throw new KasmException("式に問題が有ります");
					}
					return token[0];
				}
			} else {
				if (!p) p = 0;
				for (i = token.length - 1; i >= 0; i--) {
					if (p == 1 && (token[i] == "*" || token[i] == "/")) {
						var1 = calculate(token.slice(0, i), p + 1);
						var2 = calculate(token.slice(i + 1), p + 1);
						return token[i] == "*" ? var1 * var2 : var1 / var2;
					} else if (p == 0 && (token[i] == "+" || token[i] == "-")) {
						var1 = calculate(token.slice(0, i), p + 1);
						var2 = calculate(token.slice(i + 1), p + 1);
						return token[i] == "+" ? var1 + var2 : var1 - var2;
					}
				}
				return calculate(token, p + 1);
			}
		},
		assemble: function(source){
			var lines = source.split("\n");
			this.binary = [];
			var normalBinaryOp = {
				"LD": 6, "ST": 7, "SBC": 8, "ADC": 9, "SUB": 10, "ADD": 11, "EOR": 12,
				"OR": 13, "AND": 14, "CMP": 15
			};
			var simpleOp = {
				"OUT": 16, "IN": 31, "RCF": 32, "SCF": 47, "NOP": 0, "HLT": 15
			};
			var branchCC = {
				"BA": 0, "BNZ": 1, "BZP": 2, "BP": 3, "BNI": 4, "BNC": 5, "BGE": 6,
				"BGT": 7, "BVF": 8, "BZ": 9, "BN": 10, "BZN": 11, "BNO": 12, "BC": 13,
				"BLT": 14, "BLE": 15
			};
			var addr = 0;
			var errorCount = 0;
			var labels = {};
			var patches = [];
			var ended = -1;
			var metadata = [], addrToMetadata = {};
			var VALUE_NOT_FIXED = 0xFFF1, VALUE_FIXED = 0xFFF2;
			this.message("アセンブルを開始しました。");
			for (var l = 0; l < lines.length; l++) {
				var line = lines[l];
				var labelFlg = 0;
				try {
					var meta = {line: l, address: addr, jumpTo: -1, jumpMode: 0, reachable: 0, opecode: null,
								acc: VALUE_NOT_FIXED, ix: VALUE_NOT_FIXED};
					var a = this.tokenize(line);
					if (ended >= 0) {
						if (a.length > 0) {
							this.message("情報(" + (ended+1) + "行目): ここに'END'があります。これ以降に記述された命令はアセンブルされません。");
							break;
						}
						continue;
					}
					while (a.length >= 2 && a[1] == ":") {
						if (typeof a[0] == "string") {
							if (labels[a[0]]) {
								throw new KasmException("ラベル '" + a[0] + "' はすでに" + (labels[a[0]].line + 1) + "行目で定義されています");
							}
							var val = 0, iseq = 0;
							if (a.length > 3 && a[2] == "EQU") {
								try {
									val = this.calculate(a.slice(3));
								} catch (e) {
									if (e instanceof KasmException && e.val == 1) {
										throw new KasmException("EQU の右辺の式が余分です。メモリに初期値を代入するにはST命令を使用します。");

									} else throw e;
								}
								iseq = 1;
							} else {
								val = addr;
							}
							labels[a[0]] = {line: l, value: val};
							if (iseq) {
								a = [];
							} else {
								a.splice(0, 2);
								labelFlg++;
							}
						} else {
							throw new KasmException("名前 '" + a[0] + "' はラベル名として不適格です。");
						}
					}
					if (a.length > 0) {
						meta.opecode = a[0];
						if (normalBinaryOp[a[0]] != undefined) {
							var code = 0, op = normalBinaryOp[a[0]], op_a = 0, op_b = 0, val = -1;
							code += (op << 4);
							if      (a[1] == "ACC") op_a = 0;
							else if (a[1] == "IX")  op_a = 1;
							else throw new KasmException("オペレータ " + a[0] + " の第一オペランドに指定できるのはACCかIXのみです。 '" + a[1] + "' は指定できません。");
							if (a[2] != ",") throw new KasmException("'" + a[1] + "' の後に ',' が必要です");
							if      (a[3] == "ACC") op_b = 0;
							else if (a[3] == "IX")  op_b = 1;
							else if (a[3] == "[" || a[3] == "(") {
								var startBrace = a[3];
								var endBrace = a[a.length - 1];
								val = -2;
								op_b = (a[3] == "[" ? 4 : 5);
								a.splice(0, 4);
								if (a[0] == "IX") {
									op_b += 2;
									if (a[1] != "+") throw new KasmException("'IX' の後に '+' が必要です");
									a.splice(0, 2);
								}
								if (startBrace == '(' && endBrace == ')' ||
								   startBrace == '[' && endBrace == ']') {
									a.splice(-1);
								} else {
									throw new KasmException("閉じ括弧が不適切です");
								}
							} else {
								val = -2;
								op_b = 2;
								a.splice(0, 3);

							}
							if (code == 0x70 && op_b < 4) {	// ST with second operand ACC, IX, d
								throw new KasmException("ST命令の第2引数にACC, IX, 定数は使用できません。");
							}
							code += ((op_a << 3) + op_b);
							this.binary[addr++] = code;
							if (val != -1) {
								this.binary[addr++] = val;
								if (val == -2) {
									patches.push({op: op, address: addr - 1, token: a, line: l, mask: (startBrace == '(' ? 0x1FF : 0xFF)});
								}
							}
							// if (op == 6) { // LD
							// 	if (op_a == 0) meta.acc = VALUE_FIXED;
							// 	else		   meta.ix  = VALUE_FIXED;
							// } else if (op == 7) {	// ST
							// 	if      (op_b == 0) meta.acc = VALUE_FIXED;
							// 	else if (op_b == 1) meta.ix  = VALUE_FIXED;
							// }
						} else if (simpleOp[a[0]] != undefined) {
							this.binary[addr++] = simpleOp[a[0]];
							if (a.length > 1) {
								throw new KasmException("命令 '" + a[0] + "' にオペランドは不要です");
							}
							if (a[0] == "HLT") {
								meta.jumpMode = -1;
							}
						} else if (a[0] == "END") {
							ended = l;
						} else if (branchCC[a[0]] != undefined) {
							var op = branchCC[a[0]] + 48;
							this.binary[addr++] = op;
							patches.push({op: op, address: addr, token: a.slice(1), line:l, mask: 0xFF});
							meta.jumpTo = addr;
							if (a[0] == "BA") meta.jumpMode = -2;
							else meta.jumpMode = 1;
							this.binary[addr++] = 1;
						} else if (a[0][0] == 'R' || a[0][0] == 'S') {
							var code = 64 + (a[0][0] == 'R' ? 4 : 0);
							if (a[0][2] == 'L') code += 2;
							else if (a[0][2] != 'A') throw new KasmException("命令 '" + a[0] + "' は間違っています");
							if (a[0][1] == 'L') code += 1;
							else if (a[0][1] != 'R') throw new KasmException("命令 '" + a[0] + "' は間違っています");
							if (a[1] == "IX") code += 8;
							else if (a[1] != "ACC") throw new KasmException("第二オペランドはACCかIXである必要が有ります");
							if (a.length != 2) throw new KasmException("オペランドの数が間違っています");
							this.binary[addr++] = code;
						} else {
							if (labelFlg && typeof a[0] == "number")
								throw new KasmException("数値 " + a[0] + " は無効です。ラベルに対応する数値を定義するには、数値の前に 'EQU' を補います。");
							else throw new KasmException("命令 '" + a[0] + "' を認識できません。");
						}
						addrToMetadata[meta.address] = meta;
						metadata.push(meta);
					}
				} catch (e) {
					if (e instanceof KasmException) {
						this.message("エラー(" + (l+1) + "行目): " + e.message);
						errorCount++;
					} else throw e;
				}
			}
			for (var i = 0; i < patches.length; i++) {
				var addr = patches[i].address, token = patches[i].token;
				var op = patches[i].op;
				for (var j = 0; j < token.length; j++) {
					if (labels[token[j]]) {
						token[j] = labels[token[j]].value;
					}
				}
				var arithNum = null;
				if ([8, 9, 10, 11, 15].indexOf(op) >= 0) {
					// Arithmetic command
					if (token.length == 1) arithNum = token[0];
				}
				try {
					var val = this.calculate(token);
					if ((val < 0 ? ~val : val) & (~patches[i].mask)) throw new KasmException("定数値 " + val + "が大きすぎます");
					if (arithNum !== null && val >= 0x80) {
						var nn = (~val & 0xFF) + 1;
						var realNum = Math.abs(nn).toString(16).toUpperCase() + "h";
						if (nn >= 0xA0) realNum = "-0" + realNum;
						else realNum = "-" + realNum;
						this.message("情報(" + (patches[i].line+1) + "行目): 数値 " + arithNum + " は最上位ビットが1のため負数として扱われます。間違いを防ぐため、代わりに " + realNum + "と記述することをおすすめします。");
					}
					val &= 0xFF;
					this.binary[addr] = val;
				} catch (e) {
					if (e instanceof KasmException) {
						this.message("エラー(" + (patches[i].line+1) + "行目): " + e.message);
						errorCount++;
					} else throw e;
				}
			}
			do {
				var metaUpated = 0;
				for (var i = 0; i < metadata.length; i++) {
					var reachable = (metadata[i].reachable || i == 0 ||
						(metadata[i - 1].jumpMode >= 0 && metadata[i - 1].reachable)) ? 1 : 0;
					if (metadata[i].jumpMode == 1 || metadata[i].jumpMode == -2) {
						if (addrToMetadata[this.binary[metadata[i].jumpTo]] == undefined) {
							this.message("エラー(" + (metadata[i].line + 1) + "行目): この命令のジャンプ先は命令ではありません。誤ってデータを実行してしまう可能性があります");
							errorCount++;
						} else if (!addrToMetadata[this.binary[metadata[i].jumpTo]].reachable) {
							metaUpated++;
							addrToMetadata[this.binary[metadata[i].jumpTo]].reachable = 1;
						}
					}
					if (reachable && !metadata[i].reachable) {
						metadata[i].reachable = reachable;
						metaUpated++;
					}
				}
			} while (metaUpated);
			for (var i = 0; i < metadata.length; i++) {
				if (!metadata[i].reachable && metadata[i].opecode && metadata[i].opecode != "NOP" &&
					metadata[i].opecode != "END") {
					this.message("情報(" + (metadata[i].line + 1) + "行目): この命令は到達不可能です");
				}
				if (i > 0 && metadata[i - 1].jumpMode >= 0 && metadata[i - 1].opecode != null &&
					("SR".indexOf(metadata[i - 1].opecode[0]) != -1) && "RL".indexOf(metadata[i - 1].opecode[1]) != -1) {
					if (metadata[i].opecode[0] == "B" && metadata[i].opecode != "BA" && metadata[i].opecode != "BNO" && metadata[i].opecode != "BNI") {
						this.message("情報(" + (metadata[i].line + 1) + "行目): ロテート, シフト命令の結果のフラグレジスタに依存する処理に見えます。KUE-CHIP2の問題により正しく実行されない可能性が有ります。");
					}
				}
			}
			if (metadata[i - 1].jumpMode >= 0 && metadata[i - 1].reachable) {
				this.message("エラー: プログラムの末尾に 'HLT' 命令がありません。CPUが暴走する可能性が有ります。'HLT' を補ってください。");
				errorCount++;
			}
			this.message("アセンブルを終了しました。");
			if (errorCount > 0) this.message("エラー: " + errorCount + "個");
			return errorCount == 0;
		},
		disassemble: function(){}
	};
	window['KemuAssembler'] = kemuAssembler;
})(window);
