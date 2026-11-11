import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { ReleaseStack } from '../lib/release-stack';
import { account, region } from '../lib/names';

function synthesize(): Template {
  const frontendDistPath = mkdtempSync(join(tmpdir(), 'go-api-frontend-'));
  writeFileSync(join(frontendDistPath, 'index.html'), '<html></html>');
  const app = new cdk.App();
  const stack = new ReleaseStack(app, 'GoApiRelease', {
    env: { account, region },
    imageTag: 'abc123',
    frontendDistPath,
    reportCodeKey: 'lambda/go-api-report.zip',
  });
  return Template.fromStack(stack);
}

describe('release stack', () => {
  it('points the existing service, bucket, and Lambda at the new version', () => {
    const template = synthesize();
    const json = JSON.stringify(template.toJSON());

    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      Family: 'go-api',
      Cpu: '256',
      Memory: '512',
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'go-api',
          Secrets: Match.arrayWith([
            Match.objectLike({ Name: 'DATABASE_URL' }),
          ]),
        }),
      ]),
    });
    template.resourceCountIs('AWS::ECS::Service', 0);
    template.resourceCountIs('AWS::S3::Bucket', 0);
    assert.match(json, /\/go-api:abc123/);
    assert.match(json, /go-api-frontend-357278306946/);
    assert.match(json, /go-api-report/);
    assert.match(json, /updateService/);
    assert.match(json, /updateFunctionCode/);
    assert.match(json, /createInvalidation/);
    assert.match(json, /E357T1GJ1G381I/);
    assert.equal(json.includes('DesiredCount'), false);
  });

  it('does not adopt the database, load balancer, CloudFront, or WAF', () => {
    const json = JSON.stringify(synthesize().toJSON());
    for (const resource of [
      'AWS::RDS::DBInstance',
      'AWS::ElasticLoadBalancingV2::LoadBalancer',
      'AWS::CloudFront::Distribution',
      'AWS::WAFv2::WebACL',
      'AWS::ECR::Repository',
    ]) {
      assert.equal(json.includes(`"${resource}"`), false, resource);
    }
  });
});
