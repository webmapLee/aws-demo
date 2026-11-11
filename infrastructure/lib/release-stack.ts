import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import {
  account,
  databaseSecretArn,
  distributionId,
  ecsClusterName,
  ecsServiceName,
  executionRoleArn,
  frontendBucketName,
  imageRepositoryName,
  region,
  reportFunctionName,
  sourceBucketName,
  taskRoleArn,
} from './names';

export interface ReleaseStackProps extends cdk.StackProps {
  readonly imageTag: string;
  readonly frontendDistPath: string;
  readonly reportCodeKey: string;
}

export class ReleaseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ReleaseStackProps) {
    super(scope, id, props);

    const repository = ecr.Repository.fromRepositoryName(this, 'ApiRepository', imageRepositoryName);
    const executionRole = iam.Role.fromRoleArn(this, 'ExecutionRole', executionRoleArn, { mutable: false });
    const taskRole = iam.Role.fromRoleArn(this, 'TaskRole', taskRoleArn, { mutable: false });
    const databaseUrl = secretsmanager.Secret.fromSecretCompleteArn(this, 'DatabaseUrl', databaseSecretArn);
    const apiLogs = logs.LogGroup.fromLogGroupName(this, 'ApiLogs', '/ecs/go-api');

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'ApiTask', {
      family: 'go-api',
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      executionRole,
      taskRole,
    });
    taskDefinition.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    const container = taskDefinition.addContainer('go-api', {
      image: ecs.ContainerImage.fromEcrRepository(repository, props.imageTag),
      essential: true,
      logging: ecs.LogDrivers.awsLogs({
        logGroup: apiLogs,
        streamPrefix: 'go-api',
      }),
      environment: {
        PORT: '8080',
        GIN_MODE: 'release',
      },
      secrets: {
        DATABASE_URL: ecs.Secret.fromSecretsManager(databaseUrl),
      },
    });
    container.addPortMappings({ containerPort: 8080, protocol: ecs.Protocol.TCP });

    const serviceArn = `arn:aws:ecs:${region}:${account}:service/${ecsClusterName}/${ecsServiceName}`;
    new cr.AwsCustomResource(this, 'PointServiceAtTask', {
      installLatestAwsSdk: false,
      onCreate: {
        service: 'ECS',
        action: 'updateService',
        parameters: {
          cluster: ecsClusterName,
          service: ecsServiceName,
          taskDefinition: taskDefinition.taskDefinitionArn,
        },
        physicalResourceId: cr.PhysicalResourceId.of(`${ecsClusterName}/${ecsServiceName}`),
      },
      onUpdate: {
        service: 'ECS',
        action: 'updateService',
        parameters: {
          cluster: ecsClusterName,
          service: ecsServiceName,
          taskDefinition: taskDefinition.taskDefinitionArn,
        },
        physicalResourceId: cr.PhysicalResourceId.of(`${ecsClusterName}/${ecsServiceName}`),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['ecs:UpdateService', 'ecs:DescribeServices'],
          resources: [serviceArn],
        }),
      ]),
    });

    const frontendBucket = s3.Bucket.fromBucketName(this, 'FrontendBucket', frontendBucketName);
    new s3deploy.BucketDeployment(this, 'Frontend', {
      sources: [s3deploy.Source.asset(props.frontendDistPath)],
      destinationBucket: frontendBucket,
      prune: true,
    });

    const distributionArn = `arn:aws:cloudfront::${account}:distribution/${distributionId}`;
    new cr.AwsCustomResource(this, 'InvalidateSite', {
      installLatestAwsSdk: false,
      onCreate: {
        service: 'CloudFront',
        action: 'createInvalidation',
        parameters: {
          DistributionId: distributionId,
          InvalidationBatch: {
            CallerReference: props.imageTag,
            Paths: { Quantity: 1, Items: ['/*'] },
          },
        },
        physicalResourceId: cr.PhysicalResourceId.of(`invalidate-${props.imageTag}`),
      },
      onUpdate: {
        service: 'CloudFront',
        action: 'createInvalidation',
        parameters: {
          DistributionId: distributionId,
          InvalidationBatch: {
            CallerReference: props.imageTag,
            Paths: { Quantity: 1, Items: ['/*'] },
          },
        },
        physicalResourceId: cr.PhysicalResourceId.of(`invalidate-${props.imageTag}`),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['cloudfront:CreateInvalidation'],
          resources: [distributionArn],
        }),
      ]),
    });

    const reportArn = `arn:aws:lambda:${region}:${account}:function:${reportFunctionName}`;
    new cr.AwsCustomResource(this, 'UpdateReportCode', {
      installLatestAwsSdk: false,
      onCreate: {
        service: 'Lambda',
        action: 'updateFunctionCode',
        parameters: {
          FunctionName: reportFunctionName,
          S3Bucket: sourceBucketName,
          S3Key: props.reportCodeKey,
        },
        physicalResourceId: cr.PhysicalResourceId.of(reportFunctionName),
      },
      onUpdate: {
        service: 'Lambda',
        action: 'updateFunctionCode',
        parameters: {
          FunctionName: reportFunctionName,
          S3Bucket: sourceBucketName,
          S3Key: props.reportCodeKey,
        },
        physicalResourceId: cr.PhysicalResourceId.of(reportFunctionName),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['lambda:UpdateFunctionCode', 'lambda:GetFunction'],
          resources: [reportArn],
        }),
        new iam.PolicyStatement({
          actions: ['s3:GetObject'],
          resources: [`arn:aws:s3:::${sourceBucketName}/${props.reportCodeKey}`],
        }),
      ]),
    });

    new cdk.CfnOutput(this, 'ImageTag', { value: props.imageTag });
  }
}

export const defaultFrontendDistPath = path.join(__dirname, '../../frontend/dist');
