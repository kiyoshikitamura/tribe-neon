const stages = [
  ...['shinjuku','shibuya'].flatMap(area => [1,2,3].map(n => [area,n,'beginner'])),
  ...['ikebukuro','roppongi'].flatMap(area => [1,2,3].map(n => [area,n,'intermediate'])),
  ...['akihabara','kawasaki'].flatMap(area => [1,2,3].map(n => [area,n,'advanced'])),
  ['yokohama',1,'advanced'], ['yokohama',2,'expert'], ['yokohama',3,'expert'],
];
if (stages.length !== 21) throw new Error('expected 21 stages');
const counts = Object.groupBy(stages, row => row[2]);
if (counts.beginner.length !== 6 || counts.intermediate.length !== 6 || counts.advanced.length !== 7 || counts.expert.length !== 2) {
  throw new Error('unexpected Encounter difficulty counts');
}
console.log(JSON.stringify({ status: 'PASS', stages: stages.length, counts: Object.fromEntries(Object.entries(counts).map(([k,v]) => [k,v.length])) }));
