import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import {
  account,
  codeBuildProjectName,
  codeBuildRoleName,
  deployRoleName,
  imageRepositoryName,
  oidcAccount,
  oidcRoleName,
  region,
  sourceBucketName,
} from './names';

export class OidcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const sourceBucket = new s3.Bucket(this, 'SourceBucket', {
      bucketName: sourceBucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          prefix: 'source/',
          expiration: cdk.Duration.days(14),
        },
      ],
    });

    const projectArn = `arn:aws:codebuild:${region}:${this.account}:project/${codeBuildProjectName}`;
    const deployRoleArn = `arn:aws:iam::${account}:role/${deployRoleName}`;
    const githubRole = iam.Role.fromRoleArn(
      this,
      'GitHubOidcRole',
      `arn:aws:iam::${oidcAccount}:role/${oidcRoleName}`,
      { mutable: true },
    );
    githubRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['codebuild:StartBuild', 'codebuild:BatchGetBuilds'],
      resources: [projectArn],
    }));
    sourceBucket.grantPut(githubRole, 'source/*');

    const logGroup = new logs.LogGroup(this, 'BuildLogs', {
      logGroupName: `/aws/codebuild/${codeBuildProjectName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const buildRole = new iam.Role(this, 'CodeBuildRole', {
      roleName: codeBuildRoleName,
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com', {
        conditions: {
          StringEquals: {
            'aws:SourceAccount': this.account,
          },
          ArnLike: {
            'aws:SourceArn': projectArn,
          },
        },
      }),
    });
    sourceBucket.grantRead(buildRole);
    sourceBucket.grantPut(buildRole, 'lambda/*');
    logGroup.grantWrite(buildRole);
    buildRole.addToPolicy(new iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [deployRoleArn],
    }));

    new codebuild.Project(this, 'CiProject', {
      projectName: codeBuildProjectName,
      role: buildRole,
      source: codebuild.Source.s3({
        bucket: sourceBucket,
        path: 'source/placeholder.zip',
      }),
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true,
        computeType: codebuild.ComputeType.SMALL,
      },
      environmentVariables: {
        IMAGE_REPO_NAME: { value: imageRepositoryName },
        AWS_ACCOUNT_ID: { value: account },
        DEPLOY_ROLE_ARN: { value: deployRoleArn },
      },
      logging: {
        cloudWatch: { logGroup, enabled: true },
      },
      timeout: cdk.Duration.minutes(30),
    });

    new cdk.CfnOutput(this, 'GitHubOidcRoleArn', {
      value: githubRole.roleArn,
    });
    new cdk.CfnOutput(this, 'SourceBucketName', {
      value: sourceBucket.bucketName,
    });
  }
}
