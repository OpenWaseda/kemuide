/// <reference path="lib/jquery.d.ts" />

class KUEChip2 {
	private regs: {[index: string]: number; } = {
		"ACC":		0,
		"IX":		0,
		"FLAG":		0,
		"IR":		0,
		"PC":		0,
		"MAR":		0,
		"NextPhase":0,
	};
	private codeMemory: number[] = [];
	private dataMemory: number[] = [];
	private codeMemoryCell: JQuery[] = [];
	private dataMemoryCell: JQuery[] = [];
	private regCell: JQuery[] = [];
	private MARTarget: number[] = this.codeMemory;
	private hltFlag: boolean = false;
	//
	private intervalID: any = null;
	private breakFlag: boolean = false;
	//
	private smTable: ((v: number)=>any)[][] = [
		[
			// SRA
			function(v: number): number
			{
				this.setFlag(KUEChip2.FlagMask.CF, v & 0x01);
				v = v >> 1;
				return (v | (v & 0x40 << 1));
			},
			function(v: number): void
			{
				this.setFlag(KUEChip2.FlagMask.VF, 0);
				this.setFlag(KUEChip2.FlagMask.NF, ((v & 0x80) ? 1 : 0));
				this.setFlag(KUEChip2.FlagMask.ZF, (v == 0 ? 1 : 0));
			},
		],
		[
			// SLA
			// V
			function(v: number): number
			{
				this.setFlag(KUEChip2.FlagMask.CF, ((v & 0x80) ? 1 : 0));
				return (v << 1);
			},
			function(v: number): void
			{
				this.setFlag(KUEChip2.FlagMask.VF, (((this.regs["FLAG"] & KUEChip2.FlagMask.CF) ? 1 : 0) != ((v & 0x80) ? 1 : 0)) ? 1 : 0);
				this.setFlag(KUEChip2.FlagMask.NF, ((v & 0x80) ? 1 : 0));
				this.setFlag(KUEChip2.FlagMask.ZF, (v == 0 ? 1 : 0));
			},
		],
		[
			// SRL
			function(v){
				this.setFlag(KUEChip2.FlagMask.CF, v & 0x01);
				return (v >> 1);
			},
			function(v){
				this.setFlag(KUEChip2.FlagMask.VF, 0);
				this.setFlag(KUEChip2.FlagMask.NF, ((v & 0x80) ? 1 : 0));
				this.setFlag(KUEChip2.FlagMask.ZF, (v == 0 ? 1 : 0));
			},
		],
		[
			// SLL
			function(v){
				this.setFlag(KUEChip2.FlagMask.CF, ((v & 0x80) ? 1 : 0));
				return (v << 1);
			},
			function(v){
				this.setFlag(KUEChip2.FlagMask.VF, 0);
				this.setFlag(KUEChip2.FlagMask.NF, ((v & 0x80) ? 1 : 0));
				this.setFlag(KUEChip2.FlagMask.ZF, (v == 0 ? 1 : 0));
			},
		],
		[
			// RRA
			function(v){
				var b7 = (this.regs["FLAG"] & KUEChip2.FlagMask.CF) ? 1 : 0;
				this.setFlag(KUEChip2.FlagMask.CF, v & 0x01);
				return ((v >> 1) | (b7 * 0x80));
			},
			function(v){
				this.setFlag(KUEChip2.FlagMask.VF, 0);
				this.setFlag(KUEChip2.FlagMask.NF, ((v & 0x80) ? 1 : 0));
				this.setFlag(KUEChip2.FlagMask.ZF, (v == 0 ? 1 : 0));
			},
		],
		[
			// RLA
			// V
			function(v){
				var b0 = (this.regs["FLAG"] & KUEChip2.FlagMask.CF) ? 1 : 0;
				this.setFlag(KUEChip2.FlagMask.CF, ((v & 0x80) ? 1 : 0));
				return ((v << 1) | b0);
			},
			function(v){
				this.setFlag(KUEChip2.FlagMask.VF, (((this.regs["FLAG"] & KUEChip2.FlagMask.CF) ? 1 : 0) != ((v & 0x80) ? 1 : 0)) ? 1 : 0);
				this.setFlag(KUEChip2.FlagMask.NF, ((v & 0x80) ? 1 : 0));
				this.setFlag(KUEChip2.FlagMask.ZF, (v == 0 ? 1 : 0));
			},
		],
		[
			// RRL
			function(v){
				var b0 = v & 0x01;
				this.setFlag(KUEChip2.FlagMask.CF, b0);
				return ((v >> 1) | (b0 << 7));
			},
			function(v){
				this.setFlag(KUEChip2.FlagMask.VF, 0);
				this.setFlag(KUEChip2.FlagMask.NF, ((v & 0x80) ? 1 : 0));
				this.setFlag(KUEChip2.FlagMask.ZF, (v == 0 ? 1 : 0));
			},
		],
		[
			// RLL
			function(v){
				var b7 = (v & 0x80) ? 1 : 0;
				this.setFlag(KUEChip2.FlagMask.CF, b7);
				return ((v << 1) | b7);
			},
			function(v){
				this.setFlag(KUEChip2.FlagMask.VF, 0);
				this.setFlag(KUEChip2.FlagMask.NF, ((v & 0x80) ? 1 : 0));
				this.setFlag(KUEChip2.FlagMask.ZF, (v == 0 ? 1 : 0));
			},
		],
		
	];
	private arithmeticTable: (((a: number, b: number)=>number) | number[])[][]= [
		[
			// SBC
			function(a, b){ return a - b - ((this.regs["FLAG"] & KUEChip2.FlagMask.CF) ? 1 : 0); },
			[]
		],
		[
			// ADC
			function(a, b){ return a + b + ((this.regs["FLAG"] & KUEChip2.FlagMask.CF) ? 1 : 0); },
			[]
		],
		[
			// SUB
			function(a, b){ return a - b; },
			[-1]
		],
		[
			// ADD
			function(a, b){ return a + b; },
			[-1]
		],
		[
			// EOR
			function(a, b){ return a ^ b; },
			[-1, 0]
		],
		[
			// OR
			function(a, b){ return a | b; },
			[-1, 0]
		],
		[
			// AND
			function(a, b){ return a & b; },
			[-1, 0]
		],
		[
			// CMP
			function(a, b){ return a - b; },
			[-1]
		],
	];
	private dispatchTable: {[index: string]: ((op: any)=>void)[]; } = {
		"HLT": [
			function(op){
				this.regs["NextPhase"] = 0;
				//console.log("HLT");
				this.hltFlag = true;
			}
		],
		"NOP": [
			function(op){
				this.regs["NextPhase"] = 0;
				//console.log("NOP");
			}
		],
		"OUT": [
			function(op){
				this.regs["NextPhase"] = 0;
				console.log("OUT");
			}
		],
		"IN": [
			function(op){
				this.regs["NextPhase"] = 0;
				console.log("IN");
			}
		],
		"RCF": [
			function(op){
				this.regs["FLAG"] &= ~KUEChip2.FlagMask.CF;
				this.regs["NextPhase"] = 0;
				//console.log("RCF");
			}
		],
		"SCF": [
			function(op){
				this.regs["FLAG"] |= KUEChip2.FlagMask.CF;
				this.regs["NextPhase"] = 0;
				//console.log("SCF");
			}
		],
		"Bcc": [
			function(op){
				this.loadPCToMAR();
				this.regs["NextPhase"]++;
			},
			function(op){
				this.regs["NextPhase"] = 0;
				var branchTarget = this.fetchAtMAR();
				//console.log("B" + branchConds[op.cc] + " " + branchTarget.toString(16).toUpperCase())
				//
				var zf = (this.regs["FLAG"] & KUEChip2.FlagMask.ZF) != 0;
				var nf = (this.regs["FLAG"] & KUEChip2.FlagMask.NF) != 0;
				var vf = (this.regs["FLAG"] & KUEChip2.FlagMask.VF) != 0;
				var cf = (this.regs["FLAG"] & KUEChip2.FlagMask.CF) != 0;
				switch(op.cc){
					case 0x00: // Absolute
						break;
					case 0x01: // Not Zero
						if(!zf) break;
						return;
					case 0x02: // Zero or Positive
						if(!nf) break;
						return;
					case 0x03: // Positive
						if(!(nf || zf)) break;
						return;
					case 0x04: // No Input
						// if(!zf) break;
						console.log("NOT IMPLEMENTED!!!!");
						return;
					case 0x05: // No Carry
						if(!cf) break;
						return;
					case 0x06: // Greater than or Equal
						if(!(vf !== nf)) break;
						return;
					case 0x07: // Greater than
						if(!((vf != nf) || zf)) break;
						return;
					case 0x08: // oVErflow
						if(vf) break;
						return;
					case 0x09: // Zero
						if(zf) break;
						return;
					case 0x0a: // Negative
						if(nf) break;
						return;
					case 0x0b: // Zero or Negative
						if(nf || zf) break;
						return;
					case 0x0c: // Not Outputted
						// if(!zf) break;
						console.log("NOT IMPLEMENTED!!!!");
						return;
					case 0x0d: // Carry
						if(cf) break;
						return;
					case 0x0e: // Less Than
						if(vf !== nf) break;
						return;
					case 0x0f: // Less Than or Equal 
						if((vf !== nf) || zf) break;
						return;
				}
				this.regs["PC"] = branchTarget;
				//console.log("branch taken.");
			},
		],
		"RSop": [
			function(op){
				this.regs[KUEChip2.AddrTypeNameList[op.A]] = this.smTable[op.B][0](this.regs[KUEChip2.AddrTypeNameList[op.A]]) & 0xFF;
				this.regs["NextPhase"]++;
				//console.log("Ssm");
			},
			function(op){
				this.smTable[op.B][0](this.regs[KUEChip2.AddrTypeNameList[op.A]])
				this.regs["NextPhase"] = 0;
			}
		],
		"LD": [
			function(op){	// P2
				if(this.isBReg(op.B)){
					this.regs[KUEChip2.AddrTypeNameList[op.A]] = this.regs[KUEChip2.AddrTypeNameList[op.B]]
					this.regs["NextPhase"] = 0;
					//console.log("LD " + addrTypes[op.A] + ", " + addrTypes[op.B]);
				} else{
					this.loadPCToMAR();
					this.regs["NextPhase"]++;
				}
			},
			function(op){	// P3
				if(this.isBImm(op.B)){
					this.regs[KUEChip2.AddrTypeNameList[op.A]] = this.fetchAtMAR();
					this.regs["NextPhase"] = 0;
					//console.log("LD " + addrTypes[op.A] + ", 0x" + regs[addrTypes[op.A]].toString(16).toUpperCase());
				} else{
					this.loadBAddrToMAR(op.B);
					this.regs["NextPhase"]++;
				}
			},
			function(op){	// P4
				this.regs[KUEChip2.AddrTypeNameList[op.A]] = this.fetchAtMAR();
				this.regs["NextPhase"] = 0;
				//
	/*
				if(MARTarget == codeMemory){
					console.log("LD " + addrTypes[op.A] + ", codeMem[0x" + regs["MAR"].toString(16).toUpperCase() + "]");
				} else{
					console.log("LD " + addrTypes[op.A] + ", dataMem(0x" + regs["MAR"].toString(16).toUpperCase() + ")");
				}
	*/
			},
		],
		"ST": [
			function(op){	// P2
				if(this.isBReg(op.B) || this.isBImm(op.B)){
					throw ("Invalid op" + op);
				} else{
					this.loadPCToMAR();
					this.regs["NextPhase"]++;
				}
			},
			function(op){	// P3
				this.loadBAddrToMAR(op.B);
				this.regs["NextPhase"]++;
			},
			function(op){	// P4
				this.storeToMAR(this.regs[KUEChip2.AddrTypeNameList[op.A]]);
				this.regs["NextPhase"] = 0;
				//
	/*
				if(MARTarget == codeMemory){
					console.log("ST codeMem[0x" + regs["MAR"].toString(16).toUpperCase() + "], " + addrTypes[op.A]);
				} else{
					console.log("ST dataMem(0x" + regs["MAR"].toString(16).toUpperCase() + "), " + addrTypes[op.A]);
				}
	*/
			},
		],
		"Aop": [
			function(op){	// P2
				// Arithmetic Operations
				if(this.isBReg(op.B)){
					this.performArithmeticOp(op);
					this.regs["NextPhase"] = 0;
				} else{
					this.loadPCToMAR();
					this.regs["NextPhase"]++;
				}
			},
			function(op){	// P3
				if(this.isBImm(op.B)){
					this.performArithmeticOp(op);
					this.regs["NextPhase"] = 0;
				} else{
					this.loadBAddrToMAR(op.B);
					this.regs["NextPhase"]++;
				}
			},
			function(op){	// P4
				this.performArithmeticOp(op);
				this.regs["NextPhase"] = 0;
			},
		],
	};
	private initCPU()
	{
		for(var k in this.regs){
			this.regs[k] = 0;
		}
		if(localStorage[KUEChip2.LSKEY_CodeMemory] !== undefined){
			this.codeMemory = JSON.parse(localStorage[KUEChip2.LSKEY_CodeMemory]);
		}
		//
		if(localStorage[KUEChip2.LSKEY_DataMemory] !== undefined){
			this.dataMemory = JSON.parse(localStorage[KUEChip2.LSKEY_DataMemory]);
		}
		//
		for(var i = 0; i < 0x100; i++){
			this.codeMemory[i] = (this.codeMemory[i] === undefined) ? 0 : this.codeMemory[i];
			this.dataMemory[i] = (this.dataMemory[i] === undefined) ? 0 : this.dataMemory[i];
		}
	}
	private initView()
	{
		//
		// regtable
		//
		var t = $('<table>').addClass("table").addClass("table-bordered");
		t.append($('<thead>').append(
			$('<tr>')
			.append($('<th>').text("RegName").css("width", "20%"))
			.append($('<th>').text("Data"))
		));
		var tb = $('<tbody>');
		for(var k in this.regs){
			this.regCell[k] = $('<td>');
			tb.append(
				$('<tr>')
				.append($('<th>').text(k))
				.append(this.regCell[k].text("-"))
			)
		}
		t.append(tb);
		$("#regtable").append(t);
		//
		var that = this;
		//
		var f = function(sel: JQuery){
			this.updateMemView(sel, that.codeMemory);
		};
		this.initMemTable(this.codeMemoryCell, "#codememtable", f, 0x000);
		//
		var f = function(sel: JQuery){
			this.updateMemView(sel, that.dataMemory);
		};
		this.initMemTable(this.dataMemoryCell, "#datamemtable", f, 0x100);
	}
	private initMemTable(selList: JQuery[], tabelId: string, callback: Function, addrOfs: number)
	{
		if(addrOfs === undefined) addrOfs = 0;
		addrOfs >>= 4;
		var t = $('<table>').addClass("table").addClass("table-bordered");
		var tr = $('<tr>').append($('<th>').text("Addr/Ofs"));
		for(var i = 0; i < 16; i++){
			tr.append($('<th>').text(("0"+i.toString(16)).slice(-2).toUpperCase()));
		}
		t.append($('<thead>').append(tr));
		var tb = $('<tbody>');
		for(var i = 0; i < 16; i++){
			
			var tr = $('<tr>').append($('<th>').text(((addrOfs + i).toString(16) + "0").toUpperCase()));
			for(var k = 0; k < 16; k++){
				var d = $('<input>')
					.attr("type", "text")
					.attr("name", ""+((i << 4) + k))
					.addClass("text-center")
					.change(function(sel){callback(sel);});
				selList[(i << 4) + k] = d;
				tr.append($("<td>").css("padding", "0").append(d));
			}
			tb.append(tr);
		}
		t.append(tb);
		$(tabelId).append(t);

	}
	private updateView()
	{
		for(var k in this.regs){
			this.regCell[k].text(("0"+this.regs[k].toString(16)).slice(-2).toUpperCase());
		}
		for(var i = 0; i < 0x100; i++){
			this.codeMemoryCell[i].val(("0"+this.codeMemory[i].toString(16)).slice(-2).toUpperCase());
			this.dataMemoryCell[i].val(("0"+this.dataMemory[i].toString(16)).slice(-2).toUpperCase());
		}
	}
	private updateMemView(sel, targetMemData){
		var idx = parseInt(sel.target.name, 10);
		var data = parseInt(sel.target.value, 16);
		if(isNaN(data) || data < 0 || 0xff < data){
			console.log("Invalid data: " + data);
			data = targetMemData[idx];
		} else{
			targetMemData[idx] = data;
		}
		$(sel.target).val(("0"+data.toString(16)).slice(-2).toUpperCase());
		this.saveMemoryToLocalStorage();
	}
	private saveMemoryToLocalStorage()
	{
		localStorage[KUEChip2.LSKEY_CodeMemory] = JSON.stringify(this.codeMemory);
		localStorage[KUEChip2.LSKEY_DataMemory] = JSON.stringify(this.dataMemory);
	}
	private setFlag(mask: KUEChip2.FlagMask, v: number)
	{
		if(v != 0 && v != 1) return;
		this.regs["FLAG"] = (this.regs["FLAG"] & ~mask) | (mask * v);
	}
	private isBReg(B)
	{
		return (B < 2);
	}
	private isBImm(B)
	{
		return (2 <= B && B < 4);
	}
	private loadPCToMAR()
	{
		// (PC) -> MAR
		this.regs["MAR"] = this.regs["PC"];
		this.regs["PC"]++;
		this.regs["PC"] &= 0xff;
		this.MARTarget = this.codeMemory;
	}
	private loadBAddrToMAR(B)
	{
		var d = this.fetchAtMAR();
		if(B >= 6){
			d += this.regs["IX"];
		}
		this.regs["MAR"] = d;
		this.MARTarget = (B & 1) ? this.dataMemory : this.codeMemory;
	}
	private fetchAtMAR()
	{
		return this.MARTarget[this.regs["MAR"]];
	}
	private storeToMAR(v)
	{
		this.MARTarget[this.regs["MAR"]] = v;
	}
	private getAdjustedResult(v)
	{
		if(v < 0){
			v = -v;
			v = ~v;
			v++;
		}
		v &= 0xff;
		return v;
	}
	private calcOp(vA, vB, opFunc, flgTable)
	{
		var vR = opFunc.call(this, vA, vB);
		var rA = (vA & 0x80) ? -((vA ^ 0xff) + 1) : vA;
		var rB = (vB & 0x80) ? -((vB ^ 0xff) + 1) : vB;
		var rR = opFunc.call(this, rA, rB);
		//
		var CF = flgTable[0];
		var VF = flgTable[1];
		var NF = flgTable[2];
		var ZF = flgTable[3];
		//
		if(CF === undefined)	CF = (vR & (~0xff)) != 0 ? 1 : 0;
		this.setFlag(KUEChip2.FlagMask.CF, CF);
		//
		if(VF === undefined)	VF = (rR < -128 || 127 < rR) ? 1 : 0;
		this.setFlag(KUEChip2.FlagMask.VF, VF);
		//
		vR = this.getAdjustedResult(rR);
		//
		if(NF === undefined)	NF = (vR & 0x80) != 0 ? 1 : 0;
		this.setFlag(KUEChip2.FlagMask.NF, NF);
		//
		if(ZF === undefined)	ZF = (vR == 0) ? 1 : 0;
		this.setFlag(KUEChip2.FlagMask.ZF, ZF);
		//
		//console.log([CF, VF, NF, ZF]);
		return vR;
	}
	private performArithmeticOp(op)
	{
		var vA = this.regs[KUEChip2.AddrTypeNameList[op.A]];
		var vB, vR, at;
		if(this.isBReg(op.B)){
			vB = this.regs[KUEChip2.AddrTypeNameList[op.B]];
		} else{
			vB = this.fetchAtMAR();
		}
		//
		at = this.arithmeticTable[op.subOp];
		vR = this.calcOp(vA, vB, at[0], at[1]);
		//
		if(KUEChip2.AopNameList[op.subOp] !== "CMP"){
			this.regs[KUEChip2.AddrTypeNameList[op.A]] = vR;
		}
		//console.log(": " + subops[op.subOp] + " " + vA + ", " + vB + " = " + vR);
	}

	private getInstrGroupName(instr)
	{
		if((instr & 0xf8) == 0){
			return "NOP";
		} else if((instr & 0xf8) == 8){
			return "HLT";
		} else if((instr & 0xf0) == 0x50){
			return "HLT";
		} else if((instr & 0xf8) == 0x10){
			return "OUT";
		} else if((instr & 0xf8) == 0x18){
			return "IN";
		} else if((instr & 0xf8) == 0x20){
			return "RCF";
		} else if((instr & 0xf8) == 0x28){
			return "SCF";
		} else if((instr & 0xf0) == 0x30){
			return "Bcc";
		} else if((instr & 0xf0) == 0x40){
			return "RSop";
		} else if((instr & 0xf0) == 0x60){
			return "LD";
		} else if((instr & 0xf0) == 0x70){
			return "ST";
		}
		return "Aop";
	}
	// http://www.html5rocks.com/ja/tutorials/file/dndfiles/
	private handleFileSelect(evt){
		evt.stopPropagation();
		evt.preventDefault();

		var files = evt.dataTransfer.files; // FileList object.

		// files is a FileList of File objects. List some properties.
		var output = [];
		for(var i = 0, f; f = files[i]; i++){
			var r = new FileReader();
			var that = this;
			r.onload = (function(file){
				return function(e){
					//console.log(r.result);
					var s = r.result.replace(/#.*?\n/g, "").replace(/(\s)/g, "");
					console.log(s);
					for(i = 0; i < s.length; i += 2){
						that.codeMemory[i / 2] = parseInt(s.substr(i, 2), 16);
					}
					that.updateView();
				}
			})(f);
			r.readAsText(f);
			break;
		}
	}
	private handleDragOver(evt){
		evt.stopPropagation();
		evt.preventDefault();
		evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy    .
	}
	//
	constructor(){
		var dropZone = document.getElementById('uploadArea');
		var that = this;
		dropZone.addEventListener('dragover', function(e){ return that.handleDragOver(e); }, false);
		dropZone.addEventListener('drop', function(e){ return that.handleFileSelect(e); }, false);
		this.initCPU();
		this.initView();
		this.updateView();
	}
	public resetCPU()
	{
		for(var k in this.regs){
			this.regs[k] = 0;
		}
		this.hltFlag = false;
		this.updateView();
	}
	public clearData()
	{
		for(var i = 0; i < 0x100; i++){
			this.dataMemory[i] = 0;
		}
		this.updateView();
	}
	public clearCode()
	{
		for(var i = 0; i < 0x100; i++){
			this.codeMemory[i] = 0;
		}
		this.updateView();
	}
	public runCPU()
	{
		if(this.intervalID){
			this.breakFlag = true;
		} else{
			var that = this;
			this.intervalID = window.setInterval(
				function(){
					for(var i = 0; i < 100; i++){
						that.nextInstr();
						if(that.hltFlag || that.breakFlag){
							window.clearInterval(that.intervalID);
							that.intervalID = null;
							that.breakFlag = false;
							break;
						}
					}
					that.updateView();
				}
			,1)
		}
	}
	public nextInstr()
	{
		for(;;){
			this.nextPhase();
			if(this.hltFlag || this.regs["NextPhase"] == 0) break;		
		}	
	}
	public nextPhase()
	{
		var instr = this.regs["IR"];
		var ig = this.getInstrGroupName(instr);
		if(this.regs["NextPhase"] == 0){
			this.loadPCToMAR();
			this.regs["NextPhase"]++;
		} else if(this.regs["NextPhase"] == 1){
			this.regs["IR"] = this.fetchAtMAR();
			this.regs["NextPhase"]++;
		} else{
			if(this.dispatchTable[ig] && this.dispatchTable[ig][this.regs["NextPhase"] - 2]){
				this.dispatchTable[ig][this.regs["NextPhase"] - 2].call(this, {
					"code": instr,
					"A": (instr & 0x08) >> 3,
					"B": (instr & 0x07),
					"subOp": (instr & 0x70) >> 4,
					"sm": (instr & 0x03),
					"cc": (instr & 0x0F),
				});
			}/* else{
				console.log("Not implemented." + instr);
			}*/
		}
	}
}

module KUEChip2
{
	export const LSKEY_CodeMemory: string = "KUE-CHIP2_CodeMemory";
	export const LSKEY_DataMemory: string = "KUE-CHIP2_DataMemory";
	export const AopNameList: string[] = [
		"SBC", "ADC", "SUB", "ADD", "EOR", "OR", "AND", "CMP"
	];
	export const BranchCondNameList: string[] = [
		"A", "NZ", "ZP", "P", "NI", "NC", "GE", "GT",
		"VF", "Z", "N", "ZN", "NO", "C", "LT", "LE"
	];
	export const AddrTypeNameList: string[] = [
		"ACC", "IX", "d", "[d]", "(d)", "[IX + d]", "(IX + d)"
	];
	//
	export enum FlagMask
	{
		ZF = 0x01,
		NF = 0x02,
		VF = 0x04,
		CF = 0x08
	}
}
