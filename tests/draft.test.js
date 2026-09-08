import test from "node:test";
import assert from "node:assert/strict";
import { mergeDraft } from "../manager/public/draft.js";
const a={id:1,name:"A",phone:"111"}, b={id:2,name:"B",phone:"222"};
test("independent manager edits merge while retaining remote removals",()=>{
  const result=mergeDraft([a,b],[{...a,phone:"333"},b],[a]);
  assert.equal(result.conflicts.length,0);assert.deepEqual(result.merged,[{...a,phone:"333"}]);
});
test("edit versus removal requires an explicit manager choice",()=>{
  const result=mergeDraft([a],[{...a,phone:"333"}],[]);
  assert.equal(result.conflicts.length,1);assert.equal(result.conflicts[0].published,undefined);
});
test("identical concurrent edits do not create false conflicts",()=>{
  assert.equal(mergeDraft([a],[{...a,phone:"333"}],[{...a,phone:"333"}]).conflicts.length,0);
});
test("two edits to the same record preserve both versions for review",()=>{
  const result=mergeDraft([a],[{...a,name:"My shop"}],[{...a,phone:"444"}]);
  assert.equal(result.conflicts[0].mine.name,"My shop");assert.equal(result.conflicts[0].published.phone,"444");
});
