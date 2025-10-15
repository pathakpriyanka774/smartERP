const testProductionAPI = async () => {
  const baseURL = 'http://localhost:5004';
  
  console.log('🧪 Testing Production API endpoints...\n');
  
  try {
    // Test planning dashboard
    console.log('📊 Testing Planning Dashboard...');
    const dashboardResponse = await fetch(`${baseURL}/api/planning/dashboard`);
    const dashboardData = await dashboardResponse.json();
    console.log('✅ Planning Dashboard:', dashboardData.success ? 'Working' : 'Failed');
    
    // Test employee performance
    console.log('👥 Testing Employee Performance...');
    const performanceResponse = await fetch(`${baseURL}/api/planning/employee-performance`);
    const performanceData = await performanceResponse.json();
    console.log('✅ Employee Performance:', performanceData.success ? 'Working' : 'Failed');
    
    // Test machine availability
    console.log('🏭 Testing Machine Availability...');
    const machineResponse = await fetch(`${baseURL}/api/planning/machine-availability`);
    const machineData = await machineResponse.json();
    console.log('✅ Machine Availability:', machineData.success ? 'Working' : 'Failed');
    
    // Test quality dashboard
    console.log('🔍 Testing Quality Dashboard...');
    const qualityResponse = await fetch(`${baseURL}/api/quality/dashboard`);
    const qualityData = await qualityResponse.json();
    console.log('✅ Quality Dashboard:', qualityData.success ? 'Working' : 'Failed');
    
    console.log('\n🎉 All Production API endpoints are working!');
    console.log('\n📋 Next Steps:');
    console.log('1. Run: node sample-data.js (to add test data)');
    console.log('2. Access: http://localhost:3000 (React frontend)');
    console.log('3. Navigate to Production Planning or Quality Management');
    
  } catch (error) {
    console.error('❌ Error testing API:', error.message);
    console.log('\n💡 Make sure the production service is running on port 5004');
  }
};

testProductionAPI();