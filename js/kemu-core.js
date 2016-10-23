/*
 * kemu (pronounced KM) - by yasuo ozu
 * distributed under the MIT license.
 **/

;(function(window){
	var kemuCore = function(){
		this.memory = new Array(0x200);
		this.reg = {
			"FLAG"	: 0, "ACC"	: 0, "IX"	: 0, "PC"	: 0, "IR"	: 0,
			"MAR"	: 0, "IBUF"	: 0, "OBUF"	: 0, "PHASE": 0
		};
		this.flag = {
			"IBUF": false, "OBUF": false
		};
		this.constructor();
		this.reset();
	};
	kemuCore.prototype = {
		constructor: function(){
			for (var i = 0; i < 0x200; i++)
				this.memory[i] = 0;
		},
		reset: function(){
			this.halted = 0;
			for (var k in this.reg) {
				if (k) this.reg[k] = 0;
			}
			this.flag["IBUF"] = false;
			this.flag["OBUF"] = false;
		},
		disassemble: function() {
			var index = 0;
			var res = [];
			while (index < 0x100) {
				var addr = index;
				var data = this.memory[index++];
				var opecode = data >> 4;
				var cc = data & 0xF;
				var a = (cc & 8) > 0 ? true : false;
				var sm = cc & 3;
				var b = cc & 7;
				var ins = [];
				if (opecode == 0) {	// NOP / HLT
					ins.push(a ? "HLT" : "NOP");
				} else if (opecode == 1) {	// OUT / IN
					ins.push(a ? "IN" : "OUT");
				} else if (opecode == 2) {	// RCF / SCF
					ins.push(a ? "SCF" : "RCF");
				} else if (opecode == 3) {	// Bcc
					var ccList = ["A", "NZ", "ZP", "P", "NI", "NC", "GE", 
						"GT", "VF", "Z", "N", "ZN", "NO", "C", "LT", "LE"];
					ins.push("B" + ccList[cc]);
					var d = this.memory[index++];
					ins.push(d);
				} else if (opecode == 4) {	// Ssm / Rsm
					var smList = ["RA", "LA", "RL", "LL"];
					ins.push(((cc & 4) > 0 ? "R": "S") + smList[sm]);
					ins.push(a ? "IX" : "ACC");
				} else if (opecode == 5) {	// invalid operator
					var count = 0;
					do {
						ins.push(this.memory[index++]);
						count++;
					} while (count < 4 && 5 <= this.memory[index] && this.memory[index] <= 7);
				} else {
					var opTable = ["LD", "ST", "SBC", "ADC", "SUB", "ADD", "EOR", "OR", "AND", "CMP"];
					ins.push(opTable[opecode - 6]);
					ins.push(a ? "IX" : "ACC");
					ins.push(",");
					if (b == 0) ins.push("ACC");
					else if (b == 1) ins.push("IX");
					else {
						var d = this.memory[index++];
						if (b == 2 || b == 3) ins.push(d);
						else {
							ins.push((b & 1) > 0 ? "(" : "[");
							if (b == 6 || b == 7) {
								ins.push("IX");
								ins.push("+");
							}
							ins.push(d);
							ins.push((b & 1) > 0 ? ")" : "]");
						}
					}
				}
				res.push({
					'disassemble': ins,
					'addr': addr,
					'binary': this.memory.slice(addr, index)
				});
			}
			return res;
		},
		runSinglePhase: function(){
			if (this.halted) return;
			var p = this.reg["PHASE"]++;
			if      (p == 0) this.reg["MAR"] = this.reg["PC"]++;
			else if (p == 1) this.reg["IR"] = this.memory[this.reg["MAR"]];
			else {
				var ir = this.reg["IR"];
				var opecode = ir >> 4;
				var cc = ir & 0xF;
				var a = (cc & 8) > 0 ? 1 : 0;
				var sm = cc & 3;
				var b = cc & 7;
				if (opecode == 0) {		// HLT, NOP
					if (a > 0) this.halted = true;
				} else if (opecode == 1) {	// OUT, IN
					if (a == 0) {	// OUT
						this.reg["OBUF"] = this.reg["ACC"];
						this.flag["OBUF"] = true;
					} else {
						this.reg["ACC"] = this.reg["IBUF"];
						this.flag["IBUF"] = false;
					}
				} else if (opecode == 2) {	// RCF, SCF
					this.reg["FLAG"] = (this.reg["FLAG"] & ~8) + a;
				} else if (opecode == 3) {	// Bcc
					if (p == 2) {
						this.reg["MAR"] = this.reg["PC"]++;
						return;
					} else {
						var flag = this.reg["FLAG"];
						var cf = (flag & 8) > 0 ? true : false;
						var vf = (flag & 4) > 0 ? true : false;
						var nf = (flag & 2) > 0 ? true : false;
						var zf = (flag & 1) > 0 ? true : false;
						var branch = false;
						if      (cc ==  0) branch = true;		// BA
						else if (cc ==  1) branch = !zf;		// BNZ
						else if (cc ==  2) branch = !nf;		// BZP
						else if (cc ==  3) branch = !nf && !zf;	// BP
						else if (cc ==  4) branch = !this.flag["IBUF"];	// BNI
						else if (cc ==  5) branch = !cf;		// BNC
						else if (cc ==  6) branch = vf == nf;	// BGE
						else if (cc ==  7) branch = vf == nf && !zf;	// BGT
						else if (cc ==  8) branch = vf;			// BVF
						else if (cc ==  9) branch = zf;			// BZ
						else if (cc == 10) branch = nf;			// BN
						else if (cc == 11) branch = zf || nf;	// BZN
						else if (cc == 12) branch = this.flag["OBUF"];	// BNO
						else if (cc == 13) branch = cf;			// BC
						else if (cc == 14) branch = vf == nf;	// BLT
						else if (cc == 15) branch = vf == nf || nf;	// BLE
						if (branch) this.reg["PC"] = this.memory[this.reg["MAR"]];
					}
				} else if (opecode == 4) {	// Ssm, Rsm
					var flag = this.reg["FLAG"];
					var cf = (flag & 8) > 0 ? true : false;
					var vf = (flag & 4) > 0 ? true : false;
					var nf = (flag & 2) > 0 ? true : false;
					var zf = (flag & 1) > 0 ? true : false;
					var val = a == 0 ? this.reg["ACC"] : this.reg["IX"];
					var cf2 = (sm & 1) == 0 ? (val & 1) > 0 : (val & 128) > 0;
					if ((sm & 1) == 0) val >>= 1;
					else val <<= 1;
					if (sm == 0) val = (val & 0x7F) + ((val & 64) > 0 ? 128 : 0);
					else if (sm == 2) sm &= 0x7F;
					else if (sm == 4) val = (val & 0x7F) + (cf ? 128 : 0);
					else if (sm == 5) val = (val & 0xFE) + (cf ? 1 : 0);
					else if (sm == 6) val = (val & 0x7E) + (cf2 ? 128 : 0);
					else if (sm == 7) val = (val & 0xFE) + (cf2 ? 1 : 0);
					this.reg["FLAG"] = (cf2 ? 8 : 0) + (vf ? 4 : 0) + (nf ? 2 : 0) + (zf ? 1 : 0);
				} else if (opecode >= 6) {
					if (b >= 2) {
						if (p == 2) {
							this.reg["MAR"] = this.reg["PC"]++;
							return;
						} else if (p == 3 && b >= 4) {
							var d = this.memory[this.reg["MAR"]];
							if ((b & 1) > 0) d += 0x100;
							if ((b & 2) > 0) d += this.reg["IX"];
							this.reg["MAR"] = d;
							return;
						}
					}
					if (opecode == 6) {
						var val = b < 2 ? ((b & 1) > 0 ? this.reg["IX"] : this.reg["ACC"]) :
							this.memory[this.reg["MAR"]];
						if (a == 0) this.reg["ACC"] = val;
						else        this.reg["IX"]  = val;
					} else if (opecode == 7) {
						var val = a > 0 ? this.reg["IX"] : this.reg["ACC"];
						this.memory[this.reg["MAR"]] = val;
					} else {
						var flag = this.reg["FLAG"];
						var cf = (flag & 8) > 0 ? true : false;
						var vf = (flag & 4) > 0 ? true : false;
						var nf = (flag & 2) > 0 ? true : false;
						var zf = (flag & 1) > 0 ? true : false;
						var val = 0, val1 = a == 0 ? this.reg["ACC"] : this.reg["IX"], val2;
						if (b < 2) val2 = b == 0 ? this.reg["ACC"] : this.reg["IX"];
						else val2 = this.memory[this.reg["MAR"]];
						if      (opecode ==  8) val = val1 - val2 - (cf ? 1 : 0);
						else if (opecode ==  9) val = val1 + val2 + (cf ? 1 : 0);
						else if (opecode == 10) val = val1 - val2;
						else if (opecode == 11) val = val1 + val2;
						else if (opecode == 12) val = val1 ^ val2;
						else if (opecode == 13) val = val1 | val2;
						else if (opecode == 14) val = val1 & val2;
						else if (opecode == 15) val = val1 - val2;
						if (opecode == 8 || opecode == 9) {	// SBC, ADC
							cf = (val & ~0xFF) > 0
						}
						if (12 <= opecode && opecode <= 14) vf = false;
						else vf = (val1 & 128) != (val & 128);
						nf = ((val & 128) > 0);
						zf = val == 0;
						this.reg["FLAG"] = (cf ? 8 : 0) + (vf ? 4 : 0) + (nf ? 2 : 0) + (zf ? 1 : 0);
						if (opecode != 15) {	// !CMP
							val = val & 0xFF;
							if (a == 0) this.reg["ACC"] = val;
							else        this.reg["IX"]  = val;
						}
					}
				}
				this.reg["PHASE"] = 0;
			}
		},
		runSingleInstruction: function(){
			if (!this.halted) {
				do {
					this.runSinglePhase();
				} while (this.reg["PHASE"] != 0);
			}
		}
	};

	window['KemuCore'] = kemuCore;

})(window);
