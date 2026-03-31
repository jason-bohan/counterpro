import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Check if Neon environment variables are set
    const apiKey = process.env.NEON_API_KEY;
    const projectId = process.env.NEON_PROJECT_ID;
    const dbName = process.env.NEON_DATABASE_NAME;

    console.log("Environment check:", {
      apiKey: apiKey ? `${apiKey.substring(0, 10)}...` : "missing",
      projectId: projectId || "missing", 
      dbName: dbName || "missing"
    });

    if (!apiKey || !projectId || !dbName) {
      return NextResponse.json({
        status: "error",
        message: "Missing Neon configuration",
        config: {
          apiKey: apiKey ? "✓ Set" : "✗ Missing",
          projectId: projectId ? "✓ Set" : "✗ Missing", 
          dbName: dbName ? "✓ Set" : "✗ Missing"
        }
      });
    }

    // Validate formats
    if (!apiKey.startsWith('napi_')) {
      return NextResponse.json({
        status: "error",
        message: "Invalid API key format - should start with napi_"
      });
    }

    // Test Neon API connection
    console.log("Testing Neon API call...");
    const apiUrl = `https://api.neon.tech/v2/projects/${projectId}`;
    console.log("API URL:", apiUrl);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      }
    });

    console.log("Response status:", response.status);
    console.log("Response headers:", Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.log("Error response:", errorText);
      
      return NextResponse.json({
        status: "error",
        message: "Neon API connection failed",
        details: errorText,
        statusCode: response.status,
        apiUrl: apiUrl
      });
    }

    const projectData = await response.json();
    console.log("Success response:", projectData);

    return NextResponse.json({
      status: "success",
      message: "Neon connection successful!",
      project: {
        name: projectData.project.name,
        id: projectData.project.id,
        databaseName: dbName
      }
    });

  } catch (error) {
    console.error("Connection test error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json({
      status: "error",
      message: "Connection test failed",
      error: errorMessage,
      stack: errorStack
    });
  }
}
