import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {localize,translate} from '../src/i18n';
test('translates full phrases and dynamic fragments',()=>{assert.equal(translate('Домены и почты','en'),'Domains & mailboxes');assert.equal(translate('44 ответов','en'),'44 replies');assert.equal(translate('44 ответов','ru'),'44 ответов');});
test('locale keeps option machine values and authored content intact',()=>{const option=localize(React.createElement('option',null,'Встреча'),'en') as React.ReactElement<any>;assert.equal(option.props.value,'Встреча');assert.equal(option.props.children,'Meeting');const text=React.createElement('p',{'data-user-content':true},'Встреча');assert.equal(localize(text,'en'),text);});
