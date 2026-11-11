import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { OidcStack } from '../lib/oidc-stack';
import { PipelineStack } from '../lib/pipeline-stack';
import { account, oidcAccount, region } from '../lib/names';

function oidcTemplate(): Template {
  const app = new cdk.App();
  const stack = new OidcStack(app, 'GoApiOidc', {
    env: { account: oidcAccount, region },
  });
  return Template.fromStack(stack);
}

function deployTemplate(): Template {
  const app = new cdk.App();
  const stack = new PipelineStack(app, 'GoApiPipeline', {
    env: { account, region },
  });
  return Template.fromStack(stack);
}

describe('oidc stack', () => {
  it('defines GitHub OIDC and CodeBuild in the sign-in account', () => {
    const template = oidcTemplate();

    template.resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 0);
    template.resourceCountIs('AWS::IAM::Role', 1);
    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Name: 'go-api-ci',
      Source: {
        Type: 'S3',
        BuildSpec: 'buildspec.yml',
      },
    });
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'go-api-codebuild',
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Principal: { Service: 'codebuild.amazonaws.com' },
            Condition: {
              StringEquals: { 'aws:SourceAccount': oidcAccount },
            },
          }),
        ]),
      },
    });
    const json = JSON.stringify(template.toJSON());
    assert.match(json, /arn:aws:iam::357278306946:role\/go-api-github-deploy/);
    assert.equal(json.includes('AKIA'), false);
  });
});

describe('deploy role stack', () => {
  it('trusts CodeBuild in the sign-in account and does not create an OIDC provider', () => {
    const template = deployTemplate();
    const json = JSON.stringify(template.toJSON());

    template.resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 0);
    template.resourceCountIs('AWS::CodeBuild::Project', 0);
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'go-api-github-deploy',
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sts:AssumeRole',
            Principal: {
              AWS: 'arn:aws:iam::235494787236:role/go-api-codebuild',
            },
          }),
        ]),
      },
    });
    for (const resource of [
      'AWS::RDS::DBInstance',
      'AWS::ElasticLoadBalancingV2::LoadBalancer',
      'AWS::CloudFront::Distribution',
      'AWS::WAFv2::WebACL',
    ]) {
      assert.equal(json.includes(resource), false, resource);
    }
  });
});
