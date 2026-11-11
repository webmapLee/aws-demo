import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import {
  account,
  codeBuildRoleName,
  deployRoleName,
  imageRepositoryName,
  oidcAccount,
  region,
} from './names';

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const codeBuildRoleArn = `arn:aws:iam::${oidcAccount}:role/${codeBuildRoleName}`;
    const deployRole = new iam.Role(this, 'GitHubDeployRole', {
      roleName: deployRoleName,
      maxSessionDuration: cdk.Duration.hours(1),
      assumedBy: new iam.ArnPrincipal(codeBuildRoleArn),
    });
    deployRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));
    deployRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:CompleteLayerUpload',
        'ecr:DescribeImages',
        'ecr:DescribeRepositories',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
        'ecr:InitiateLayerUpload',
        'ecr:PutImage',
        'ecr:UploadLayerPart',
      ],
      resources: [`arn:aws:ecr:${region}:${account}:repository/${imageRepositoryName}`],
    }));
    const bootstrapQualifier = 'hnb659fds';
    deployRole.addToPolicy(new iam.PolicyStatement({
      actions: ['sts:AssumeRole', 'sts:TagSession'],
      resources: ['deploy', 'file-publishing', 'image-publishing', 'lookup'].map((kind) =>
        `arn:aws:iam::${account}:role/cdk-${bootstrapQualifier}-${kind}-role-${account}-${region}`),
    }));

    new cdk.CfnOutput(this, 'DeployRoleArn', {
      value: deployRole.roleArn,
    });
  }
}
