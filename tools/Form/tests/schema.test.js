import '../../lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {formJsonSchema,checkForm} from '../scripts/format.js';
import {passing} from './cases.js';
import {z} from 'zod';
test('schema publishes optional paged boolean, its default and one-question refusal',()=>{
 const schema=formJsonSchema(),validator=z.fromJSONSchema(schema);
 assert.equal(schema.properties.paged.type,'boolean');
 assert.equal(schema.required.includes('paged'),false);
 assert.match(schema.properties.paged.description,/default false/i);
 assert.match(schema.properties.paged.description,/one question/i);
 for(const paged of [true,false])assert.equal(validator.safeParse({...passing[0][1],paged}).success,true);
 for(const paged of ['true',null,1,{}])assert.equal(validator.safeParse({...passing[0][1],paged}).success,false);
});
test('draft 2020-12 vocabulary is closed; zod accepts every passing fixture',()=>{
 const allowed=new Set(['type','properties','required','additionalProperties','items','minItems','maxItems','minLength','maxLength','pattern','enum','minimum','maximum','description']);
 const schema=formJsonSchema();
 function walk(s){for(const k of Object.keys(s))assert.ok(allowed.has(k),k);if(s.type==='object'){assert.equal(s.additionalProperties,false);for(const v of Object.values(s.properties))walk(v);}if(s.items)walk(s.items);}
 walk(schema);const validator=z.fromJSONSchema(schema);
 // Change 2: the shared passing fixtures include both image types with three pictures and a word.
 for(const [name,form]of passing){assert.equal(checkForm(form).ok,true,name);assert.equal(validator.safeParse(form).success,true,name+': '+JSON.stringify(validator.safeParse(form)));}
});
test('schema describes optional word choices, the picture minimum and type-only samples',()=>{
 const options=formJsonSchema().properties.questions.items.properties.options;
 assert.match(options.description,/at least two.*picture/i);
 assert.match(options.items.properties.picture.description,/optional.*image/i);
 assert.match(options.items.properties.sample.description,/both.*famil/i);
 assert.deepEqual(options.items.required,['value']);
 assert.match(options.items.description,/label is required except.*view look/);
});
test('schema callers cannot mutate the validator vocabulary',()=>{
 const schema=formJsonSchema();schema.properties.questions.items.properties.type.enum.push('other');
 assert.ok(!formJsonSchema().properties.questions.items.properties.type.enum.includes('other'));
});
