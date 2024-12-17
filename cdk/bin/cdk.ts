import 'source-map-support/register';
import { GuRoot } from '@guardian/cdk/lib/constructs/root';
import { TelemetryQW } from '../lib/telemetry-qw';

const app = new GuRoot();
new TelemetryQW(app, 'TelemetryQw-euwest-1-CODE', {
	app: 'TelemetryQW',
	stack: 'telemetry',
	stage: 'CODE',
	indexerMemorySize: 8000,
	searcherMemorySize: 3008,
	indexerPackageLocation: 'cdk.out/quickwit-lambda-indexer-beta-01-x86_64.zip',
	searcherPackageLocation:
		'cdk.out/quickwit-lambda-searcher-beta-01-x86_64.zip',
	env: { region: 'eu-west-1' },
});
