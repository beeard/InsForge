import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { CheckCircle, XCircle, ExternalLink, Copy } from 'lucide-react';
import { toast } from './ui/use-toast';

interface OAuthTestResult {
  provider: string;
  success: boolean;
  authUrl?: string;
  error?: string;
  statusCode?: number;
}

const SUPPORTED_PROVIDERS = [
  'google',
  'github',
  'discord',
  'linkedin',
  'facebook',
  'instagram',
  'tiktok',
  'apple',
  'x',
  'spotify',
  'microsoft',
];

export const OAuthTestPanel: React.FC = () => {
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [redirectUri, setRedirectUri] = useState<string>('http://localhost:3000/callback');
  const [state, setState] = useState<string>('');
  const [testResults, setTestResults] = useState<OAuthTestResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const generateRandomState = () => {
    const randomState = `test-state-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    setState(randomState);
  };

  const testSingleProvider = async (provider: string): Promise<OAuthTestResult> => {
    try {
      const params = new URLSearchParams({
        redirect_uri: redirectUri,
        ...(state && { state }),
      });

      const response = await fetch(`/api/auth/oauth/${provider}?${params}`);
      const data = await response.json();

      if (response.ok) {
        return {
          provider,
          success: true,
          authUrl: data.authUrl || data.url,
          statusCode: response.status,
        };
      } else {
        return {
          provider,
          success: false,
          error: data.message || data.error || 'Unknown error',
          statusCode: response.status,
        };
      }
    } catch (error) {
      return {
        provider,
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
        statusCode: 0,
      };
    }
  };

  const testSelectedProvider = async () => {
    if (!selectedProvider) {
      toast({
        title: 'Error',
        description: 'Please select a provider to test',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await testSingleProvider(selectedProvider);
      setTestResults([result]);
    } catch (error) {
      console.error('Test failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const testAllProviders = async () => {
    setIsLoading(true);
    try {
      const results = await Promise.all(
        SUPPORTED_PROVIDERS.map((provider) => testSingleProvider(provider))
      );
      setTestResults(results);
    } catch (error) {
      console.error('Tests failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'URL copied to clipboard',
    });
  };

  const openInNewTab = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>OAuth Provider Testing</CardTitle>
          <CardDescription>
            Test the refactored OAuth system with unified routes and type safety
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Provider Selection */}
          <div className="space-y-2">
            <Label htmlFor="provider">OAuth Provider</Label>
            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Select a provider to test" />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_PROVIDERS.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {provider.charAt(0).toUpperCase() + provider.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Redirect URI */}
          <div className="space-y-2">
            <Label htmlFor="redirectUri">Redirect URI</Label>
            <Input
              id="redirectUri"
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              placeholder="http://localhost:3000/callback"
            />
          </div>

          {/* State Parameter */}
          <div className="space-y-2">
            <Label htmlFor="state">State Parameter (Optional)</Label>
            <div className="flex gap-2">
              <Input
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="Optional state parameter"
              />
              <Button type="button" variant="outline" onClick={generateRandomState} size="sm">
                Generate
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button onClick={testSelectedProvider} disabled={isLoading || !selectedProvider}>
              {isLoading ? 'Testing...' : 'Test Selected Provider'}
            </Button>
            <Button onClick={testAllProviders} disabled={isLoading} variant="outline">
              {isLoading ? 'Testing All...' : 'Test All Providers'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Test Results */}
      {testResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
            <CardDescription>Results from OAuth provider testing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {testResults.map((result, index) => (
                <div
                  key={`${result.provider}-${index}`}
                  className="border rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium capitalize">{result.provider}</h4>
                      {result.success ? (
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Success
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <XCircle className="w-3 h-3 mr-1" />
                          Failed
                        </Badge>
                      )}
                    </div>
                    {result.statusCode && (
                      <Badge variant="outline">Status: {result.statusCode}</Badge>
                    )}
                  </div>

                  {result.success && result.authUrl && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Generated OAuth URL:</Label>
                      <div className="flex gap-2">
                        <Input value={result.authUrl} readOnly className="font-mono text-xs" />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyToClipboard(result.authUrl!)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openInNewTab(result.authUrl!)}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {!result.success && result.error && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-red-600">Error:</Label>
                      <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{result.error}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="mt-4 pt-4 border-t">
              <div className="flex gap-4 text-sm">
                <span className="text-green-600">
                  ✓ Successful: {testResults.filter((r) => r.success).length}
                </span>
                <span className="text-red-600">
                  ✗ Failed: {testResults.filter((r) => !r.success).length}
                </span>
                <span className="text-gray-600">Total: {testResults.length}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Testing Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <strong>1. Backend Testing:</strong> Run the OAuth test script:
          </p>
          <code className="block bg-gray-100 p-2 rounded">./backend/tests/local/test-oauth.sh</code>

          <p>
            <strong>2. Frontend Testing:</strong> Use this panel to test OAuth URL generation
          </p>

          <p>
            <strong>3. Full Integration:</strong> Test the complete OAuth flow by:
          </p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>Generating an OAuth URL</li>
            <li>Clicking the "Open in New Tab" button</li>
            <li>Completing the OAuth flow with the provider</li>
            <li>Verifying the callback handling</li>
          </ul>

          <p>
            <strong>4. Configuration Testing:</strong> Test OAuth configuration management in the
            admin panel
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
