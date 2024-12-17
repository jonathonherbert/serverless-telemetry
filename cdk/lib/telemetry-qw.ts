import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3_assets from 'aws-cdk-lib/aws-s3-assets';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { GuStack, GuStackProps } from '@guardian/cdk/lib/constructs/core';

interface QuickwitLambdaStackProps extends GuStackProps {
	indexerMemorySize: number;
	searcherMemorySize: number;
	indexerPackageLocation: string;
	searcherPackageLocation: string;
}

export class TelemetryQW extends GuStack {
	constructor(scope: cdk.App, id: string, props: QuickwitLambdaStackProps) {
		super(scope, id, props);

		const indexConfigPath =
			process.env.INDEX_CONFIG_PATH || 'index-config.yaml';

		const indexConfigDict = yaml.load(
			fs.readFileSync(indexConfigPath, 'utf8'),
		) as any;
		const indexId = indexConfigDict['index_id'];

		const indexConfig = new s3_assets.Asset(this, 'IndexConfigAsset', {
			path: indexConfigPath,
		});

		const lambdaEnv = {
			RUST_LOG: 'quickwit=info',
		};

		const quickwitService = new QuickwitService(this, 'QuickwitService', {
			indexId: indexId,
			indexConfigBucket: indexConfig.s3BucketName,
			indexConfigKey: indexConfig.s3ObjectKey,
			indexerEnvironment: lambdaEnv,
			searcherEnvironment: lambdaEnv,
			indexerMemorySize: props.indexerMemorySize,
			searcherMemorySize: props.searcherMemorySize,
			indexerPackageLocation: props.indexerPackageLocation,
			searcherPackageLocation: props.searcherPackageLocation,
		});

		new cdk.CfnOutput(this, 'index-store-bucket-name', {
			value: quickwitService.bucket.bucketName,
			exportName: 'quickwit-index-store-bucket-name',
		});
	}
}

export interface QuickwitServiceProps {
	indexConfigBucket: string;
	indexConfigKey: string;
	indexId: string;
	searcherPackageLocation: string;
	indexerPackageLocation: string;
	indexerMemorySize?: number;
	indexerEnvironment?: { [key: string]: string };
	searcherMemorySize?: number;
	searcherEnvironment?: { [key: string]: string };
}

export class QuickwitService extends Construct {
	public readonly bucket: Bucket;

	constructor(scope: GuStack, id: string, props: QuickwitServiceProps) {
		super(scope, id);

		const {
			indexConfigBucket,
			indexConfigKey,
			indexId,
			searcherPackageLocation,
			indexerPackageLocation,
			indexerMemorySize = 8000,
			indexerEnvironment = {},
			searcherMemorySize = 3008,
			searcherEnvironment = {},
		} = props;

		this.bucket = new Bucket(this, 'TelemetryIndexStore', {
			removalPolicy: cdk.RemovalPolicy.DESTROY,
			enforceSSL: true,
			bucketName: 'telemetry-index-store',
		});

		new IndexerService(scope, 'QuickwitIndexer', {
			storeBucket: this.bucket,
			indexId: indexId,
			indexConfigBucket: indexConfigBucket,
			indexConfigKey: indexConfigKey,
			memorySize: indexerMemorySize,
			environment: indexerEnvironment,
			assetPath: indexerPackageLocation,
		});

		new SearcherService(scope, 'QuickwitSearcher', {
			storeBucket: this.bucket,
			indexId: indexId,
			memorySize: searcherMemorySize,
			environment: searcherEnvironment,
			assetPath: searcherPackageLocation,
		});
	}
}

interface IndexerServiceProps {
	storeBucket: Bucket;
	indexId: string;
	indexConfigBucket: string;
	indexConfigKey: string;
	memorySize: number;
	environment: Record<string, string>;
	assetPath: string;
}

class IndexerService extends Construct {
	constructor(scope: GuStack, id: string, props: IndexerServiceProps) {
		super(scope, id);

		const lambda = new Function(this, 'TelemetryIndexerLambda', {
			functionName: 'telemetry-indexer-lamdba',
			code: Code.fromAsset(props.assetPath),
			runtime: Runtime.PROVIDED_AL2,
			environment: {
				QW_LAMBDA_INDEX_BUCKET: props.storeBucket.bucketName,
				QW_LAMBDA_METASTORE_BUCKET: props.storeBucket.bucketName,
				QW_LAMBDA_INDEX_ID: props.indexId,
				QW_LAMBDA_INDEX_CONFIG_URI: `s3://${props.indexConfigBucket}/${props.indexConfigKey}`,
			},
			handler: 'N/A',
			timeout: cdk.Duration.minutes(15),
			reservedConcurrentExecutions: 1,
			memorySize: props.memorySize,
			ephemeralStorageSize: cdk.Size.gibibytes(10),
		});

		lambda.addToRolePolicy(
			new PolicyStatement({
				actions: ['s3:GetObject'],
				resources: [
					`arn:aws:s3:::${props.indexConfigBucket}/${props.indexConfigKey}`,
				],
			}),
		);
		lambda.addToRolePolicy(
			new PolicyStatement({
				actions: ['s3:GetObject'],
				resources: ['arn:aws:s3:::quickwit-datasets-public/*'],
			}),
		);

		props.storeBucket.grantReadWrite(lambda);
	}
}

interface SearcherServiceProps {
	storeBucket: Bucket;
	indexId: string;
	memorySize: number;
	environment: Record<string, string>;
	assetPath: string;
}

class SearcherService extends Construct {
	constructor(scope: GuStack, id: string, props: SearcherServiceProps) {
		super(scope, id);

		const lambda = new Function(this, id, {
			functionName: 'telemetry-searcher-lamdba',
			code: Code.fromAsset(props.assetPath),
			runtime: Runtime.PROVIDED_AL2,
			environment: {
				QW_LAMBDA_INDEX_BUCKET: props.storeBucket.bucketName,
				QW_LAMBDA_METASTORE_BUCKET: props.storeBucket.bucketName,
				QW_LAMBDA_INDEX_ID: props.indexId,
			},
			handler: 'N/A',
			timeout: cdk.Duration.seconds(30),
			reservedConcurrentExecutions: 1,
			memorySize: props.memorySize,
			ephemeralStorageSize: cdk.Size.gibibytes(10),
		});

		props.storeBucket.grantReadWrite(lambda);
	}
}
