import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.join(__dirname, '../..');
const buildspec = fs.readFileSync(path.join(root, 'buildspec.yml'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/main.yml'), 'utf8');

describe('release build', () => {
  it('tests both Go modules, builds the frontend, pushes the commit image, and deploys only the release stack', () => {
    assert.match(buildspec, /services\/go-api/);
    assert.match(buildspec, /lambda\/report/);
    assert.match(buildspec, /go test \.\/\.\.\./);
    assert.match(buildspec, /npm run build/);
    assert.match(buildspec, /docker build --platform linux\/amd64/);
    assert.match(buildspec, /docker push/);
    assert.match(buildspec, /assume-role/);
    assert.match(buildspec, /image_digest=/);
    assert.match(buildspec, /cdk deploy GoApiRelease/);
    assert.match(buildspec, /IMAGE_TAG/);
    assert.equal(buildspec.includes('GoApiOidc'), false);
    assert.equal(buildspec.includes('GoApiPipeline'), false);
    assert.equal(buildspec.includes('AKIA'), false);
    assert.match(workflow, /IMAGE_TAG/);
    assert.match(workflow, /GITHUB_SHA/);
    assert.equal(workflow.includes('AKIA'), false);
  });
});
