import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

// Execute the production component handlers. The commit adapter records whether
// navigation state and dismissal occur inside the same flush, without timers.
function harness(path) {
  const cells = [];
  let index = 0, flush = 0;
  const writes = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) {
      const i = index++;
      if (!(i in cells)) cells[i] = initial;
      return [cells[i], value => { cells[i] = typeof value === 'function' ? value(cells[i]) : value; writes.push({i,value:cells[i],flush}); }];
    },
    useRef(initial) { const i = index++; return cells[i] ||= {current:initial}; },
    useEffect() {}, useLayoutEffect() {},
  };
  const module = {exports:{}};
  const require = name => {
    if (name === 'react') return {...react,default:react};
    if (name === 'react-dom') return {flushSync(fn) { flush++; try { fn(); } finally { flush--; } }};
    return {default: name, registerPresentedDialog:()=>()=>{}};
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.React}}).outputText,
    {module,exports:module.exports,require,Promise});
  return { render(props) { index=0; return module.exports.default(props); }, writes, get inCommit(){return flush > 0;} };
}
const props = {isOpen:true,title:'Mission',message:'reward',onCancel:()=>{},presentation:'canonical'};
const h = harness('src/app/components/ui/ConfirmDialog.tsx');
let navigation = false;
h.render({...props,onConfirm:()=>{assert.equal(h.inCommit,true); navigation=true;}}).props.actions.at(-1).onClick();
assert.equal(navigation,true);
assert.ok(h.writes.some(w=>w.i===0 && w.value===true && w.flush>0), 'dismissal commits with navigation');

const a = harness('src/app/components/ui/ConfirmDialog.tsx');
let resolve, reject, called=0;
const deferred = new Promise((yes,no)=>{resolve=yes;reject=no;});
let tree = a.render({...props,onConfirm:()=>{called++;return deferred;}});
tree.props.actions.at(-1).onClick();tree.props.actions.at(-1).onClick();
assert.equal(called,1,'double tap ignored');
assert.ok(!a.writes.some(w=>w.i===0 && w.value===true),'async navigation keeps modal');
assert.equal(a.render({...props,onConfirm:()=>deferred}).props.actions.at(-1).disabled,true);
reject(new Error('network'));await Promise.resolve();await Promise.resolve();
tree=a.render({...props,onConfirm:()=>{called++;return Promise.resolve();}});
assert.equal(tree.props.actions.at(-1).disabled,false,'failure permits retry');
tree.props.actions.at(-1).onClick();await Promise.resolve();
assert.equal(called,2);

// Replacement is a different React key/instance; old promise completion cannot
// dismiss or unlock the replacement. Simulate the two component lifetimes.
const old = harness('src/app/components/ui/ConfirmDialog.tsx');
const replacement = harness('src/app/components/ui/ConfirmDialog.tsx');
let finish;
old.render({...props,onConfirm:()=>new Promise(r=>{finish=r;})}).props.actions.at(-1).onClick();
replacement.render({...props,title:'New reward',onConfirm:()=>{}});
finish();await Promise.resolve();
assert.equal(replacement.writes.length,0,'old dialog does not change replacement state');
for(const path of ['src/app/page.tsx','src/app/components/TitleView.tsx']) {
  assert.match(fs.readFileSync(path,'utf8'), /key=\{confirmDialogConfig\?\.dialogId\}/);
}

const c = harness('src/app/components/ui/CanonicalDialog.tsx');
let done,count=0;
const pending=new Promise(r=>{done=r;});
const cp={title:'Auto setup',children:'',actions:[{label:'Set',onClick:()=>{count++;return pending;}}]};
const buttons=tree=>tree.children[0].children.at(-1).children[0];
buttons(c.render(cp))[0].props.onClick();buttons(c.render(cp))[0].props.onClick();
assert.equal(count,1);
assert.equal(buttons(c.render(cp))[0].props.disabled,true);
done();await Promise.resolve();
assert.equal(buttons(c.render(cp))[0].props.disabled,false);
console.log('PASS: dialog commit ordering, pending lock, double tap, failure/retry, replacement isolation, shared CanonicalDialog lock');
