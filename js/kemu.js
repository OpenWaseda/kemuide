var KUEChip2Core = (function () {
    function KUEChip2Core() {
        this.memory = [];
        this.reg = {
            "FLAG": 0,
            "ACC": 0,
            "IX": 0,
            "PC": 0,
            "IR": 0,
            "MAR": 0,
            "IBUF": 0,
            "OBUF": 0,
            "PHASE": 0
        };
        this.flag = {
            "IBUF": false,
            "OBUF": false
        };
        this.ioPreHandler = null;
        this.ioPostHandler = null;
        this.halted = false;
        this.srFlagSave = null;
        for (var i = 0; i < 0x200; i++) {
            this.memory[i] = 0;
        }
    }
    KUEChip2Core.prototype.reset = function () {
        this.halted = false;
        for (var k in this.reg) {
            if (k && k != "IBUF")
                this.reg[k] = 0;
        }
        this.flag["IBUF"] = false;
        this.flag["OBUF"] = false;
        this.srFlagSave = null;
        if (this.ioPostHandler)
            this.ioPostHandler(this);
    };
    KUEChip2Core.prototype.disassemble = function () {
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
            if (opecode == 0) {
                ins.push(a ? "HLT" : "NOP");
            }
            else if (opecode == 1) {
                ins.push(a ? "IN" : "OUT");
            }
            else if (opecode == 2) {
                ins.push(a ? "SCF" : "RCF");
            }
            else if (opecode == 3) {
                var ccList = ["A", "NZ", "ZP", "P", "NI", "NC", "GE",
                    "GT", "VF", "Z", "N", "ZN", "NO", "C", "LT", "LE"];
                ins.push("B" + ccList[cc]);
                var d = this.memory[index++];
                ins.push(d);
            }
            else if (opecode == 4) {
                var smList = ["RA", "LA", "RL", "LL"];
                ins.push(((cc & 4) > 0 ? "R" : "S") + smList[sm]);
                ins.push(a ? "IX" : "ACC");
            }
            else if (opecode == 5) {
                var count = 0;
                do {
                    ins.push(this.memory[index++]);
                    count++;
                } while (count < 4 && (this.memory[index] >> 4) == 5);
            }
            else {
                var opTable = ["LD", "ST", "SBC", "ADC", "SUB", "ADD", "EOR", "OR", "AND", "CMP"];
                ins.push(opTable[opecode - 6]);
                ins.push(a ? "IX" : "ACC");
                ins.push(",");
                if (b == 0)
                    ins.push("ACC");
                else if (b == 1)
                    ins.push("IX");
                else {
                    var d = this.memory[index++];
                    if (b == 2 || b == 3)
                        ins.push(d);
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
    };
    KUEChip2Core.prototype.runSinglePhase = function () {
        if (this.halted)
            return;
        var p = this.reg["PHASE"]++;
        if (p == 0)
            this.reg["MAR"] = this.reg["PC"]++, this.reg["PC"] &= 0xFF;
        else if (p == 1)
            this.reg["IR"] = this.memory[this.reg["MAR"]];
        else {
            var ir = this.reg["IR"];
            var opecode = ir >> 4;
            var cc = ir & 0xF;
            var a = (cc & 8) > 0 ? 1 : 0;
            var sm = cc & 3;
            var b = cc & 7;
            if (opecode == 1) {
                if (a == 0) {
                    if (p == 2)
                        this.reg["OBUF"] = this.reg["ACC"];
                    else
                        this.flag["OBUF"] = true;
                }
                else {
                    if (this.ioPreHandler)
                        this.ioPreHandler(this);
                    if (p == 2)
                        this.reg["ACC"] = this.reg["IBUF"];
                    else
                        this.flag["IBUF"] = false;
                }
                if (this.ioPostHandler)
                    this.ioPostHandler(this);
                if (p == 2)
                    return;
            }
            else if (opecode == 2) {
                this.reg["FLAG"] = (this.reg["FLAG"] & ~8) + a * 8;
            }
            else if (opecode == 3) {
                if (p == 2) {
                    this.reg["MAR"] = this.reg["PC"]++;
                    this.reg["PC"] &= 0xFF;
                    return;
                }
                else {
                    if (cc == 4 || cc == 12) {
                        if (this.ioPreHandler)
                            this.ioPreHandler(this);
                    }
                    var flag = this.reg["FLAG"];
                    var cf = (flag & 8) > 0, vf = (flag & 4) > 0, nf = (flag & 2) > 0, zf = (flag & 1) > 0;
                    var branch = false;
                    if (cc == 0)
                        branch = true; // BA
                    else if (cc == 1)
                        branch = !zf; // BNZ
                    else if (cc == 2)
                        branch = !nf; // BZP
                    else if (cc == 3)
                        branch = !nf && !zf; // BP
                    else if (cc == 4)
                        branch = !this.flag["IBUF"]; // BNI
                    else if (cc == 5)
                        branch = !cf; // BNC
                    else if (cc == 6)
                        branch = vf == nf; // BGE
                    else if (cc == 7)
                        branch = vf == nf && !zf; // BGT
                    else if (cc == 8)
                        branch = vf; // BVF
                    else if (cc == 9)
                        branch = zf; // BZ
                    else if (cc == 10)
                        branch = nf; // BN
                    else if (cc == 11)
                        branch = zf || nf; // BZN
                    else if (cc == 12)
                        branch = this.flag["OBUF"]; // BNO
                    else if (cc == 13)
                        branch = cf; // BC
                    else if (cc == 14)
                        branch = vf != nf; // BLT
                    else if (cc == 15)
                        branch = vf != nf || zf; // BLE
                    if (branch)
                        this.reg["PC"] = this.memory[this.reg["MAR"]];
                }
            }
            else if (opecode == 4) {
                if (p == 2) {
                    var flag = this.reg["FLAG"];
                    var cf = (flag & 8) > 0;
                    var val = a == 0 ? this.reg["ACC"] : this.reg["IX"];
                    var cf2 = (sm & 1) == 0 ? (val & 1) > 0 : (val & 128) > 0;
                    var typ = cc & 7;
                    if ((sm & 1) == 0)
                        val >>= 1;
                    else
                        val <<= 1;
                    val &= 0xFF;
                    if (typ == 0)
                        val = (val & 0x7F) + ((val & 64) > 0 ? 128 : 0); // SRA
                    else if (typ == 4)
                        val = (val & 0x7F) + (cf ? 128 : 0); // RRA
                    else if (typ == 5)
                        val = (val & 0xFE) + (cf ? 1 : 0); // RLA
                    else if (typ == 6)
                        val = (val & 0x7F) + (cf2 ? 128 : 0); // RRL
                    else if (typ == 7)
                        val = (val & 0xFE) + (cf2 ? 1 : 0); // RLL
                    this.srFlagSave = cf2;
                    if (a == 0)
                        this.reg["ACC"] = val;
                    else
                        this.reg["IX"] = val;
                    return;
                }
                else {
                    var val = a == 0 ? this.reg["ACC"] : this.reg["IX"];
                    var cf = !!this.srFlagSave, vf = false, nf = (val & 0x80) > 0, zf = val == 0;
                    this.reg["FLAG"] = (cf2 ? 8 : 0) + (vf ? 4 : 0) + (nf ? 2 : 0) + (zf ? 1 : 0);
                    if (sm == 1) {
                        vf = cf != nf;
                    }
                    this.reg["FLAG"] = (cf ? 8 : 0) + (vf ? 4 : 0) + (nf ? 2 : 0) + (zf ? 1 : 0);
                }
            }
            else if (opecode >= 6 && (opecode != 7 || b > 2)) {
                if (b >= 2) {
                    if (p == 2) {
                        this.reg["MAR"] = this.reg["PC"]++;
                        this.reg["PC"] &= 0xFF;
                        return;
                    }
                    else if (p == 3 && b >= 4) {
                        var d = this.memory[this.reg["MAR"]];
                        if ((b & 2) > 0) {
                            var xx = this.reg["IX"];
                            // The behavior is not correct.
                            // See https://github.com/OpenWaseda/kemuide/issues/12
                            // if (xx & 0x80) {
                            // 	xx = (~xx & 0xFF) + 1;
                            // 	d -= xx;
                            // } else {
                            // 	d += xx;
                            // }
                            d += xx;
                        }
                        d &= 0xFF;
                        if ((b & 1) > 0)
                            d += 0x100;
                        this.reg["MAR"] = d;
                        return;
                    }
                }
                if (opecode == 6) {
                    var val = b < 2 ? ((b & 1) > 0 ? this.reg["IX"] : this.reg["ACC"]) :
                        this.memory[this.reg["MAR"]];
                    if (a == 0)
                        this.reg["ACC"] = val;
                    else
                        this.reg["IX"] = val;
                }
                else if (opecode == 7) {
                    var val = a > 0 ? this.reg["IX"] : this.reg["ACC"];
                    this.memory[this.reg["MAR"]] = val;
                }
                else {
                    var flag = this.reg["FLAG"];
                    var cf = (flag & 8) > 0, vf = (flag & 4) > 0, nf = (flag & 2) > 0, zf = (flag & 1) > 0;
                    var val = 0;
                    var val1 = a == 0 ? this.reg["ACC"] : this.reg["IX"];
                    var val2;
                    if (b < 2)
                        val2 = b == 0 ? this.reg["ACC"] : this.reg["IX"];
                    else
                        val2 = this.memory[this.reg["MAR"]];
                    val1 &= 0xFF;
                    val2 &= 0xFF;
                    var val1c = val1, val2c = val2, valc; //キャリーフラグ計算用
                    if (val1 & 0x80)
                        val1 |= ~0xFF;
                    if (val2 & 0x80)
                        val2 |= ~0xFF;
                    if (opecode == 8) {
                        val = val1 - val2 - (cf ? 1 : 0); //桁あふれのある引き算は2の補数で桁あふれのない足し算
                        val2c = val2c + (cf ? 1 : 0); //繰り下がりがあったら引く数に1をたす
                        val2c = (val2c ^ 0xFF) + 1; //8ビットにおける2の補数をとる
                        valc = val1c + val2c; //8ビット目までしかなくて, 9ビット目以降が全部0だと思って演算
                    }
                    else if (opecode == 9) {
                        val = val1 + val2 + (cf ? 1 : 0);
                        valc = val1c + val2c + (cf ? 1 : 0); //8ビット目までしかなくて, 9ビット目以降が全部0だと思って演算
                    }
                    else if (opecode == 10)
                        val = val1 - val2; // SUB
                    else if (opecode == 11)
                        val = val1 + val2; // ADD
                    else if (opecode == 12)
                        val = val1 ^ val2; // EOR
                    else if (opecode == 13)
                        val = val1 | val2; // OR
                    else if (opecode == 14)
                        val = val1 & val2; // AND
                    else if (opecode == 15)
                        val = val1 - val2; // CMP
                    if (opecode == 8) {
                        cf = (valc & ~0xFF) == 0; //9ビット目以降が立っていなければ桁あふれなしでcf = true
                    }
                    else if (opecode == 9) {
                        cf = (valc & ~0xFF) != 0; //存在しないはずの9ビット目以降のビット立っていたら桁あふれ
                    }
                    if (12 <= opecode && opecode <= 14)
                        vf = false;
                    else
                        vf = (val < -128 || 127 < val);
                    nf = ((val & 128) > 0);
                    val = val & 0xFF;
                    zf = val == 0;
                    this.reg["FLAG"] = (cf ? 8 : 0) + (vf ? 4 : 0) + (nf ? 2 : 0) + (zf ? 1 : 0);
                    if (opecode != 15) {
                        if (a == 0)
                            this.reg["ACC"] = val;
                        else
                            this.reg["IX"] = val;
                    }
                }
            }
            else if (opecode != 0 || a > 0) {
                this.halted = true;
            }
            this.reg["PHASE"] = 0;
        }
    };
    KUEChip2Core.prototype.runSingleInstruction = function () {
        if (!this.halted) {
            do {
                this.runSinglePhase();
            } while (this.reg["PHASE"] != 0);
        }
    };
    return KUEChip2Core;
})();
