var LSKEY_CodeMemory = "KUE-CHIP2_CodeMemory";
var LSKEY_DataMemory = "KUE-CHIP2_DataMemory"
var regs = {"ACC": 0, "IX": 0, "FLAG": 0, "IR": 0, "PC": 0, "MAR": 0, "NextPhase": 0};
var subops = ["SBC", "ADC", "SUB", "ADD", "EOR", "OR", "AND", "CMP"];
var branchConds = ["A", "NZ", "ZP", "P", "NI", "NC", "GE", "GT", "VF", "Z", "N", "ZN", "NO", "C", "LT", "LE"];
var addrTypes = ["ACC", "IX", "d", "[d]", "(d)", "[IX + d]", "(IX + d)"];
var flagTypes = {"ZF": 0x01, "NF": 0x02, "VF": 0x04, "CF": 0x08};
// [addr] means addr in Code Memory.
// (addr) means addr in Data Memory.
//
var regSels = {};
var codeMemory = [];
var codeMemSels = [];
var dataMemory = [];
var dataMemSels = [];
var hltFlag = false;

var MARTarget = codeMemory;

function initView(){
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
	for(k in regs){
		regSels[k] = $('<td>');
		tb.append(
			$('<tr>')
			.append($('<th>').text(k))
			.append(regSels[k].text("-"))
		)
	}
	t.append(tb);
	$("#regtable").append(t);

	initMemTable(dataMemSels, "#datamemtable", dataMemChanged, 0x100)
	initMemTable(codeMemSels, "#codememtable", codeMemChanged)
}

function initMemTable(selList, tabelId, callback, addrOfs)
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

function codeMemChanged(sel){
	memChanged(sel, codeMemory);
}

function dataMemChanged(sel){
	memChanged(sel, dataMemory);
}

function memChanged(sel, targetMemData){
	var idx = parseInt(sel.target.name, 10);
	var data = parseInt(sel.target.value, 16);
	if(isNaN(data) || data < 0 || 0xff < data){
		console.log("Invalid data: " + data);
		data = targetMemData[idx];
	} else{
		targetMemData[idx] = data;
	}
	$(sel.target).val(("0"+data.toString(16)).slice(-2).toUpperCase());
	saveMemoryToLocalStorage();
}

function resetCPU()
{
	for(var k in regs){
		regs[k] = 0;
	}
	hltFlag = false;
	updateView();
}

function clearData()
{
	for(var i = 0; i < 0x100; i++){
		dataMemory[i] = 0;
	}
	updateView();
}

function initCPU()
{
	for(var k in regs){
		regs[k] = 0;
	}
	codeMemory = localStorage[LSKEY_CodeMemory];
	if(codeMemory !== undefined){
		codeMemory = JSON.parse(codeMemory);
	} else{
		codeMemory = [];
	}
	//
	dataMemory = localStorage[LSKEY_DataMemory];
	if(dataMemory !== undefined){
		dataMemory = JSON.parse(dataMemory);
	} else{
		dataMemory = [];
	}
	//
	for(var i = 0; i < 0x100; i++){
		codeMemory[i] = (codeMemory[i] === undefined) ? 0 : codeMemory[i];
		dataMemory[i] = (dataMemory[i] === undefined) ? 0 : dataMemory[i];
	}
}

function saveMemoryToLocalStorage()
{
	localStorage[LSKEY_CodeMemory] = JSON.stringify(codeMemory);
	localStorage[LSKEY_DataMemory] = JSON.stringify(dataMemory);
}

function updateView()
{
	for(var k in regs){
		regSels[k].text(("0"+regs[k].toString(16)).slice(-2).toUpperCase());
	}
	for(var i = 0; i < 0x100; i++){
		codeMemSels[i].val(("0"+codeMemory[i].toString(16)).slice(-2).toUpperCase());
		dataMemSels[i].val(("0"+dataMemory[i].toString(16)).slice(-2).toUpperCase());
	}
}

function loadPCToMAR()
{
	// (PC) -> MAR
	regs["MAR"] = regs["PC"];
	regs["PC"]++;
	MARTarget = codeMemory;
}

function isBReg(B)
{
	return (B < 2);
}

function isBImm(B)
{
	return (2 <= B && B < 4);
}

function loadBAddrToMAR(B)
{
	var d = fetchAtMAR();
	if(B >= 6){
		d += regs["IX"];
	}
	regs["MAR"] = d;
	MARTarget = (B & 1) ? dataMemory : codeMemory;
}

function fetchAtMAR()
{
	return MARTarget[regs["MAR"]];
}

function storeToMAR(v)
{
	MARTarget[regs["MAR"]] = v;
}

var dispatchTable = {
	"HLT": [
		function(){
			regs["NextPhase"] = 0;
			console.log("HLT");
			hltFlag = true;
		}
	],
	"NOP": [
		function(){
			regs["NextPhase"] = 0;
			console.log("NOP");
		}
	],
	"OUT": [
		function(){
			regs["NextPhase"] = 0;
			console.log("OUT");
		}
	],
	"IN": [
		function(){
			regs["NextPhase"] = 0;
			console.log("IN");
		}
	],
	"RCF": [
		function(){
			regs["FLAG"] &= ~flagTypes["CF"];
			regs["NextPhase"] = 0;
			console.log("RCF");
		}
	],
	"SCF": [
		function(){
			regs["FLAG"] |= flagTypes["CF"];
			regs["NextPhase"] = 0;
			console.log("SCF");
		}
	],
	"Bcc": [
		function(){
			loadPCToMAR();
			regs["NextPhase"]++;
		},
		function(op){
			regs["NextPhase"] = 0;
			var branchTarget = fetchAtMAR();
			//console.log("B" + branchConds[op.cc] + " " + branchTarget.toString(16).toUpperCase())
			//
			var zf = (regs["FLAG"] & flagTypes["ZF"]) != 0;
			var nf = (regs["FLAG"] & flagTypes["NF"]) != 0;
			var vf = (regs["FLAG"] & flagTypes["VF"]) != 0;
			var cf = (regs["FLAG"] & flagTypes["CF"]) != 0;
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
					if((nf | zf) == 0) break;
					return;
				case 0x04: // No Input
					// if(!zf) break;
					console.log("NOT IMPLEMENTED!!!!");
					return;
				case 0x05: // No Carry
					if(!cf) break;
					return;
				case 0x06: // Greater than or Equal
					if((vf ^ nf) == 0) break;
					return;
				case 0x07: // Greater than
					if(((vf ^ nf) | zf) == 0) break;
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
					if((nf | zf) == 1) break;
					return;
				case 0x0c: // Not Outputted
					// if(!zf) break;
					console.log("NOT IMPLEMENTED!!!!");
					return;
				case 0x0d: // Carry
					if(cf) break;
					return;
				case 0x0e: // Less Than
					if((vf ^ nf) == 1) break;
					return;
				case 0x0f: // Less Than or Equal 
					if(((vf ^ nf) | zf) == 1) break;
					return;
			}
			regs["PC"] = branchTarget;
			//console.log("branch taken.");
		},
	],
	"Ssm": [
		function(){
			regs["NextPhase"] = 0;
			console.log("Ssm");
			console.log("NOT IMPLEMENTED!!!!");
		}
	],
	"Rsm": [
		function(){
			regs["NextPhase"] = 0;
			console.log("Rsm");
			console.log("NOT IMPLEMENTED!!!!");
		}
	],
	"LD": [
		function(op){	// P2
			if(isBReg(op.B)){
				regs[addrTypes[op.A]] = regs[addrTypes[op.B]]
				regs["NextPhase"] = 0;
				//console.log("LD " + addrTypes[op.A] + ", " + addrTypes[op.B]);
			} else{
				loadPCToMAR();
				regs["NextPhase"]++;
			}
		},
		function(op){	// P3
			if(isBImm(op.B)){
				regs[addrTypes[op.A]] = fetchAtMAR();
				regs["NextPhase"] = 0;
				//console.log("LD " + addrTypes[op.A] + ", 0x" + regs[addrTypes[op.A]].toString(16).toUpperCase());
			} else{
				loadBAddrToMAR(op.B);
				regs["NextPhase"]++;
			}
		},
		function(op){	// P4
			regs[addrTypes[op.A]] = fetchAtMAR();
			regs["NextPhase"] = 0;
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
			if(isBReg(op.B) || isBImm(op.B)){
				throw ("Invalid op" + op);
			} else{
				loadPCToMAR();
				regs["NextPhase"]++;
			}
		},
		function(op){	// P3
			loadBAddrToMAR(op.B);
			regs["NextPhase"]++;
		},
		function(op){	// P4
			storeToMAR(regs[addrTypes[op.A]]);
			regs["NextPhase"] = 0;
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
			if(isBReg(op.B)){
				performArithmeticOp(op);
				regs["NextPhase"] = 0;
			} else{
				loadPCToMAR();
				regs["NextPhase"]++;
			}
		},
		function(op){	// P3
			if(isBImm(op.B)){
				performArithmeticOp(op);
				regs["NextPhase"] = 0;
			} else{
				loadBAddrToMAR(op.B);
				regs["NextPhase"]++;
			}
		},
		function(op){	// P4
			performArithmeticOp(op);
			regs["NextPhase"] = 0;
		},
	],
}

function setFlag(fName, v)
{
	if(v != 0 && v != 1) return;
	regs["FLAG"] = (regs["FLAG"] & ~flagTypes[fName]) | (flagTypes[fName] * v);
}

function getAdjustedResult(v)
{
	if(v < 0){
		v = -v;
		v = ~v;
		v++;
	}
	v &= 0xff;
	return v;
}

function calcOp(vA, vB, opFunc, flgTable)
{
	var vR = opFunc(vA, vB);
	var rA = (vA & 0x80) ? -((vA ^ 0xff) + 1) : vA;
	var rB = (vB & 0x80) ? -((vB ^ 0xff) + 1) : vB;
	var rR = opFunc(rA, rB);
	//
	var CF = flgTable[0];
	var VF = flgTable[1];
	var NF = flgTable[2];
	var ZF = flgTable[3];
	//
	if(CF === undefined)	CF = (vR & (~0xff)) != 0 ? 1 : 0;
	setFlag("CF", CF);
	//
	if(VF === undefined)	VF = (rR < -128 || 127 < rR) ? 1 : 0;
	setFlag("VF", VF);
	//
	vR = getAdjustedResult(rR);
	//
	if(NF === undefined)	NF = (vR & 0x80) != 0 ? 1 : 0;
	setFlag("NF", NF);
	//
	if(ZF === undefined)	ZF = (vR == 0) ? 1 : 0;
	setFlag("ZF", ZF);
	//
	//console.log([CF, VF, NF, ZF]);
	return vR;
}

var arithmeticTable = [
	[
		// SBC
		function(a, b){ return a - b - ((regs["FLAG"] & flagTypes["CF"]) ? 1 : 0); },
		[]
	],
	[
		// ADC
		function(a, b){ return a + b + ((regs["FLAG"] & flagTypes["CF"]) ? 1 : 0); },
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
]

function performArithmeticOp(op)
{
	var vA = regs[addrTypes[op.A]];
	var vB, vR;
	if(isBReg(op.B)){
		vB = regs[addrTypes[op.B]];
	} else{
		vB = fetchAtMAR();
	}
	//
	at = arithmeticTable[op.subOp];
	vR = calcOp(vA, vB, at[0], at[1]);
	//
	if(subops[op.subOp] !== "CMP"){
		regs[addrTypes[op.A]] = vR;
	}
	//console.log(": " + subops[op.subOp] + " " + vA + ", " + vB + " = " + vR);
}

function getInstrGroupName(instr)
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
	} else if((instr & 0xf4) == 0x40){
		return "Ssm";
	} else if((instr & 0xf4) == 0x44){
		return "Rsm";
	} else if((instr & 0xf0) == 0x60){
		return "LD";
	} else if((instr & 0xf0) == 0x70){
		return "ST";
	}
	return "Aop";
}

var intervalID = null;
var breakFlag = false;
function runCPU()
{
	if(intervalID){
		breakFlag = true;
	} else{
		intervalID = window.setInterval(
			function(){
				for(var i = 0; i < 100; i++){
					nextInstr();
					if(hltFlag || breakFlag){
						window.clearInterval(intervalID);
						intervalID = null;
						breakFlag = false;
						break;
					}
				}
				updateView();
			}
		,1)
	}
}

function nextInstr()
{
	for(;;){
		nextPhase();
		if(hltFlag || regs["NextPhase"] == 0) break;		
	}	
}

function nextPhase()
{
	var instr = regs["IR"];
	var ig = getInstrGroupName(instr);
	if(regs["NextPhase"] == 0){
		loadPCToMAR();
		regs["NextPhase"]++;
	} else if(regs["NextPhase"] == 1){
		regs["IR"] = fetchAtMAR();
		regs["NextPhase"]++;
	} else{
		if(dispatchTable[ig] && dispatchTable[ig][regs["NextPhase"] - 2]){
			dispatchTable[ig][regs["NextPhase"] - 2]({
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
// http://www.html5rocks.com/ja/tutorials/file/dndfiles/
function handleFileSelect(evt){
	evt.stopPropagation();
	evt.preventDefault();

	var files = evt.dataTransfer.files; // FileList object.

	// files is a FileList of File objects. List some properties.
	var output = [];
	for(var i = 0, f; f = files[i]; i++){
		var r = new FileReader();
		r.onload = (function(file){
			return function(e){
				//console.log(r.result);
				var s = r.result.replace(/#.*?\n/g, "").replace(/(\s)/g, "");
				console.log(s);
				for(i = 0; i < s.length; i += 2){
					codeMemory[i / 2] = parseInt(s.substr(i, 2), 16);
				}
				updateView();
			}
		})(f);
		r.readAsText(f);
		break;
	}
}

function handleDragOver(evt){
	evt.stopPropagation();
	evt.preventDefault();
	evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy    .
}
