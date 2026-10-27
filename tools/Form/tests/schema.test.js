import test from 'node:test';
import assert from 'node:assert/strict';
import {formJsonSchema} from '../scripts/format.js';
import {passing} from './cases.js';
import {z} from 'zod';
test('draft 2020-12 vocabulary is closed; zod accepts every passing fixture',()=>{
 const allowed=new Set(['type','properties','required','additionalProperties','items','minItems','maxItems','minLength','maxLength','pattern','enum','minimum','maximum','description']);
 const schema=formJsonSchema();
 function walk(s){for(const k of Object.keys(s))assert.ok(allowed.has(k),k);if(s.type==='object'){assert.equal(s.additionalProperties,false);for(const v of Object.values(s.properties))walk(v);}if(s.items)walk(s.items);}
 walk(schema);const validator=z.fromJSONSchema(schema);
 for(const [name,form]of passing)assert.equal(validator.safeParse(form).success,true,name+': '+JSON.stringify(validator.safeParse(form)));
});
test('schema callers cannot mutate the validator vocabulary',()=>{
 const schema=formJsonSchema();schema.properties.questions.items.properties.type.enum.push('other');
 assert.ok(!formJsonSchema().properties.questions.items.properties.type.enum.includes('other'));
});
