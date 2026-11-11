#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { OidcStack } from '../lib/oidc-stack';
import { PipelineStack } from '../lib/pipeline-stack';
import { defaultFrontendDistPath, ReleaseStack } from '../lib/release-stack';
import { account, oidcAccount, region } from '../lib/names';

const app = new cdk.App();
const imageTag = app.node.tryGetContext('imageTag') ?? 'v1';
const reportCodeKey = app.node.tryGetContext('reportCodeKey') ?? 'lambda/go-api-report.zip';

new OidcStack(app, 'GoApiOidc', {
  env: { account: oidcAccount, region },
  description: 'GitHub OIDC and CodeBuild in the account that can create an identity provider',
});

new PipelineStack(app, 'GoApiPipeline', {
  env: { account, region },
  description: 'Deploy role trusted by CodeBuild in the OIDC account',
});

new ReleaseStack(app, 'GoApiRelease', {
  env: { account, region },
  description: 'Publish a new image, frontend, and report Lambda onto the existing learning environment',
  imageTag: String(imageTag),
  frontendDistPath: defaultFrontendDistPath,
  reportCodeKey: String(reportCodeKey),
});
