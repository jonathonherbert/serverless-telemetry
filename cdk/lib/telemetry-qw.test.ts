import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { TelemetryQW } from './telemetry-qw';

describe('The TelemetryQw stack', () => {
	it('matches the snapshot', () => {
		const app = new App();
		const stack = new TelemetryQW(app, 'TelemetryQw', {
			app: 'TelemetryQW',
			stack: 'telemetry',
			stage: 'TEST',
			env: { region: 'eu-west-1' },
			indexerMemorySize: 8000,
			searcherMemorySize: 3008,
			indexerPackageLocation:
				'cdk.out/quickwit-lambda-indexer-beta-01-x86_64.zip',
			searcherPackageLocation:
				'cdk.out/quickwit-lambda-searcher-beta-01-x86_64.zip',
		});
		const template = Template.fromStack(stack);
		expect(template.toJSON()).toMatchSnapshot();
	});
});
