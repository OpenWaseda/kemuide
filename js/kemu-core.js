/*
 * kemu (pronounced KM) - by yasuo ozu
 * distributed under the MIT license.
 **/

;(function(window){
	var kemuCore = function(){
		this.memory = new Array(0x200);
		this.connected = null;
		this.constructor();
		this.reset();
	};
	kemuCore.prototype = {
		constructor: function(){
			for (var i = 0; i < 0x200; i++)
				this.memory[i] = 0;
		},
		reset: function(){
			this.phase = 0;		// next phase
			this.halted = 0;
			//
			this.regFLAG = 0;
			this.regACC	 = 0;
			this.regIX	 = 0;
			this.regPC	 = 0;
			this.regIR	 = 0;
			this.regMAR	 = 0;
			this.regIBUF = 0;
			this.regOBUF = 0;
			//
			this.flgIBUF = 0;
			this.flgOBUF = 0;
		},
		connect: function(core) {
			core.connected = this;
			this.connected = core;
			//
			core.flgIBUF = 0;
			core.flgOBUF = 0;
			this.flgIBUF = 0;
			this.flgOBUF = 0;
		},
		disconnect: function() {
			if (this.connected == null) return;
			var core = this.connected;
			core.connected = null;
			this.connected = null;
			//
			core.flgIBUF = 0;
			core.flgOBUF = 0;
			this.flgIBUF = 0;
			this.flgOBUF = 0;
		},
		runSinglePhase: function(){
			var code = this.regIR >> 4, a = (this.regIR >> 3) & 1,
			    b = this.regIR & 7;	
			if (this.phase == 0) {
				this.regMAR = this.regPC++;
			} else if (this.phase == 1) {
				this.regIR = this.memory[this.regMAR];
			} else if (code >= 8 && (phase == 2 && b <= 1 || 
				phase == 3 && (b == 2 || b == 3) || phase == 4 && b >= 4)) {	// calculate
				var val1 = a ? this.regIX : this.regACC, val2;
				if (phase == 3) val2 = b ? this.regIX : this.regACC;
				else val2 = this.memory[this.regMAR];
				var cf = (this.regFLAG & 8) ? 1 : 0;	// CF
				if      (code == 11) val1 += val2;		// ADD
				else if (code ==  9) val1 += val2 + cf;	// ADC
				else if (code == 10) val1 -= val2;		// SUB
				else if (code ==  8) val1 -= val2 + cf;	// SBC
				else if (code == 15) val1 -= val2;		// CMP
				else if (code == 14) val1 &= val2;		// AND
				else if (code == 13) val1 |= val2;		// OR
				else if (code == 12) val1 ^= val2;		// EOR
				// set flags
				if (code == 9 || code == 8)		// SBC, ABC
					this.regFLAG = (this.regFLAG & ~8) + 8 * ((0 <= val1 < 0x100) ? 0 : 1); // set CF
				if (val1 < 0) val1 = 0;
				this.regFLAG = (this.regFLAG & ~4);	// clear VF
				if (12 <= code && code <= 14)	// EOR OR AND
					/* set vf */;
				this.regFLAG = (this.regFLAG & ~2) + 2 * ((var1 & 128) >> 7);	// set NF
				this.regFLAG = (this.regFLAG & ~1) + (var1 ? 0 : 1);	// set ZF
				// write back to register
				var1 &= 0xFF;
				if (code != 15) {	// !CMP
					if (a) this.regIX  = val1;
					else   this.regACC = val1;
				}
				this.phase = -1;
			} else if (this.phase == 2) {
				if ((code >= 6 && b >= 2) || code == 3) {		// LD, ST, Bcc, calculate && b = d [d] (d) [IX+d] (IX+d)
					this.regMAR = this.regPC++;
				} else if (code == 6 && b <= 1) {	// LD (ACC | IX)
					var val = b ? this.regIX : this.regACC;
					if (a) this.regIX  = val;
					else   this.regACC = val;
					this.phase = -1;
				} else if (code == 4) {		// Ssm, Rsm
					var val = a ? this.regIX : this.regACC;
					var cf = (this.regFLAG & 8) ? 1 : 0;	// CF
					var vf = 0, nf, zf;
					if (b == 0 || b == 2) {	// SRA, SRL
						cf = val & 1;
						val >>= 1;
						val &= 127;
						if (b == 0) val += (val & 64) * 2;
					} else if (b == 1 || b == 3) {	// SLA, SLL
						cf = (val & 128) ? 1 : 0;
						val <<= 1;
					} else if (b == 4 || b == 6) {	// RRA, RRL
						val += 256 * (b == 4 ? cf : (val & 1));
						cf = val & 1;
						val >>= 1;
					} else {	// RLA, RLL
						val <<= 1;
						val += b == 5 ? cf : ((val & 256) >> 8);
						cf = !!(val & 256);
					}
					val &= 0xFF;
					if (b == 1 || b == 5) vf = cf;
					nf = (val & 128) ? 1 : 0;
					zf = val ? 0 : 1;
					this.regFLAG = cf * 8 + vf * 4 + nf * 2 + zf;
					if (a) this.regIX  = val;
					else   this.regACC = val;
					this.phase = -1;
				} else if (code == 2) {		// RCF, SCF
					this.regFLAG = (this.regFLAG & ~8) + 8 * a;
					this.phase = -1;
				} else if (coe == 0) {		// NOP, HLT
					if (a) this.halted = 1;
					this.phase = -1;
				} else if (code == 1) {		// OUT, IN
					if (a) {
						this.regACC  = this.regIBUF;
						this.flgIBUF = 0;
						if (this.connected != null) this.connected.flgOBUF = 0;
					} else {
					 	this.regOBUF = this.regACC;
						this.flgOBUF = 1;
						if (this.connected != null) this.connected.flgIBUF = 1;
					}
					this.phase = -1;
				}
			} else if (this.phase == 3) {
				if (code == 6 && (b == 2 || b == 3)) {	// LD-d
					if (a) this.regIX  = this.memory[this.regMAR];
					else   this.regACC = this.memory[this.regMAR];
					this.phase = -1;
				} else if (code >= 6 && b >= 4) {	// LD, ST, calcuate [d](d)[IX+d](IX+d)
					if (b <= 5) this.regMAR = this.memory[this.regMAR];
					else this.regMAR = this.regIX + this.memory[this.regMAR];
					this.regMAR &= 0xFF;
				} else if (code == 3) {
					var res = 0, cond = this.regIR & 15;
					var cf = (this.regFLAG & 8) >> 3, vf = (this.regFLAG & 4) >> 2,
						nf = (this.regFLAG & 2) >> 1, zf = (this.regFLAG & 1);
					if      (cond == 0) res = 1;
					else if (cond == 8) res = vf;		// VF=1
					else if (cond == 1) res = 1 - zf;	// ZF=0
					else if (cond == 9) res = zf;		// ZF=1
					else if (cond == 2) res = 1 - nf;	// NF=0
					else if (cond ==10) res = nf;		// NF=1
					else if (cond == 3) res = nf || zf ? 0 : 1;	// NF || ZF=0
					else if (cond ==11) res = nf || zf ? 1 : 0;	// NF || ZF=1
					else if (cond == 4) res = this.flgIBUF ? 0 : 1;			// OnNoInput
					else if (cond ==12) res = this.flgOBUF ? 1 : 0;			// OnNoOutput
					else if (cond == 5) res = 1 - cf;	// CF=0
					else if (cond ==13) res = cf;		// CF=1
					else if (cond == 6) res = (vf + nf) && vf * nf == 0 ? 0 : 1;
					else if (cond ==14) res = (vf + nf) && vf * nf == 0 ? 1 : 0;
					else if (cond == 7) res = ((vf + nf) && vf * nf == 0) || zf ? 0 : 1;
					else if (cond ==15) res = ((vf + nf) && vf * nf == 0) || zf ? 1 : 0;
					if (res) this.regPC = this.memory[this.regMAR];
					this.phase = -1;
				}
			} else if (this.phase == 4) {
				if (code == 6) {	// LD
					if (a) this.regIX  = this.memory[this.regMAR];
					else   this.regACC = this.memory[this.regMAR];
				} else if (code == 7) {	// ST
					this.memory[this.regMAR] = a ? this.regIX : this.regACC;
				}
				this.phase = -1;
			}
			this.phase++;
		},
		runSingleInstruction: function(){
			if (!this.halted) {
				do {
					this.runSinglePhase();
				} while (this.phase == 0);
			}
		}
	};

	window['kemuCore'] = kemuCore;

})(window);
