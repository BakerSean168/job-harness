import { describe, expect, it } from 'vitest';
import type { SemanticMappingView } from '@job-harness/apply-contracts';
import { OpenAiSemanticFieldMapper } from '../src/semantic-mapper';

const view: SemanticMappingView = {
  fields: [
    {
      id: 'field-email',
      type: 'email',
      label: '联系邮箱',
      name: 'contactEmail',
      description: null,
      required: true,
      options: [],
      semanticHints: ['email address'],
      sensitivityHint: null,
    },
    {
      id: 'field-gender',
      type: 'select',
      label: '性别',
      name: 'gender',
      description: null,
      required: true,
      options: [{ value: 'male', label: '男', disabled: false }],
      semanticHints: ['gender'],
      sensitivityHint: 'protected',
    },
  ],
  catalog: [
    {
      key: 'contact.email',
      label: '邮箱',
      valueType: 'email',
      sensitivity: 'sensitive',
      aliases: ['email', '电子邮箱'],
      allowAiMapping: true,
    },
    {
      key: 'person.gender',
      label: '性别',
      valueType: 'choice',
      sensitivity: 'protected',
      aliases: ['gender'],
      allowAiMapping: false,
    },
  ],
};

describe('OpenAiSemanticFieldMapper', () => {
  it('sends only value-free field/catalog metadata and filters protected/non-allowlisted mappings', async () => {
    let requestBody: any = null;
    const mapper = new OpenAiSemanticFieldMapper({
      baseUrl: 'http://127.0.0.1:4000',
      apiKey: 'test-key',
      model: 'gpt-5.6-luna',
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                mappings: [
                  { fieldId: 'field-email', applicantKey: 'contact.email', confidence: 0.98, reason: 'email label' },
                  { fieldId: 'field-gender', applicantKey: 'person.gender', confidence: 1, reason: 'protected guess' },
                  { fieldId: 'unknown', applicantKey: 'contact.email', confidence: 1, reason: 'invalid field' },
                ],
              }),
            },
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });

    const proposals = await mapper.propose(view);
    expect(proposals).toEqual([
      { fieldId: 'field-email', applicantKey: 'contact.email', confidence: 0.98, reason: 'email label' },
    ]);

    expect(requestBody.model).toBe('gpt-5.6-luna');
    const sent = JSON.parse(requestBody.messages[1].content);
    expect(sent.catalog).toEqual([
      expect.objectContaining({ key: 'contact.email', label: '邮箱' }),
    ]);
    expect(JSON.stringify(sent)).not.toContain('person.gender');
    expect(JSON.stringify(sent)).not.toContain('test@example.com');
    expect(requestBody.response_format).toEqual({ type: 'json_object' });
  });

  it('keeps only the highest-confidence valid mapping per field', async () => {
    const mapper = new OpenAiSemanticFieldMapper({
      baseUrl: 'http://mapper.test/v1/',
      apiKey: 'test-key',
      model: 'semantic-model',
      fetchImpl: async (url) => {
        expect(String(url)).toBe('http://mapper.test/v1/chat/completions');
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                mappings: [
                  { fieldId: 'field-email', applicantKey: 'contact.email', confidence: 0.94, reason: 'candidate' },
                  { fieldId: 'field-email', applicantKey: 'contact.email', confidence: 0.97, reason: 'better' },
                ],
              }),
            },
          }],
        }), { status: 200 });
      },
    });

    await expect(mapper.propose(view)).resolves.toEqual([
      { fieldId: 'field-email', applicantKey: 'contact.email', confidence: 0.97, reason: 'better' },
    ]);
  });

  it('fails closed on provider or malformed response errors', async () => {
    const providerFailure = new OpenAiSemanticFieldMapper({
      baseUrl: 'http://mapper.test',
      apiKey: 'test-key',
      model: 'semantic-model',
      fetchImpl: async () => new Response('provider error\nnext', { status: 503 }),
    });
    await expect(providerFailure.propose(view)).rejects.toThrow(/Semantic mapper HTTP 503/);

    const malformed = new OpenAiSemanticFieldMapper({
      baseUrl: 'http://mapper.test',
      apiKey: 'test-key',
      model: 'semantic-model',
      fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'not-json' } }] }), { status: 200 }),
    });
    await expect(malformed.propose(view)).rejects.toThrow(/not valid JSON/);
  });
});
