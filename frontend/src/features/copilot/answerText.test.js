import test from 'node:test'
import assert from 'node:assert/strict'
import { answerParagraphs } from './answerText.js'

test('model line breaks are kept as paragraphs', () => {
  assert.deepEqual(answerParagraphs('세 공항 모두 IFR이에요.\n청주는 1.5km예요. 6시까지예요.\n\n김포는 2km예요.'),
    ['세 공항 모두 IFR이에요.', '청주는 1.5km예요. 6시까지예요.', '김포는 2km예요.'])
})

test('a single block splits by sentence without breaking decimals', () => {
  assert.deepEqual(answerParagraphs('제주는 시정 1.5km로 IFR이에요. 자정까지 이어져요. 그 뒤 회복돼요.'),
    ['제주는 시정 1.5km로 IFR이에요.', '자정까지 이어져요.', '그 뒤 회복돼요.'])
  assert.deepEqual(answerParagraphs(''), [])
  assert.deepEqual(answerParagraphs('어느 공항 기준으로 볼까요?'), ['어느 공항 기준으로 볼까요?'])
})
