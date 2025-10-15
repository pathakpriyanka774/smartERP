const testAPI = async () => {
  const baseURL = 'http://localhost:5004';
  
  try {
    console.log('🧪 Testing Employee Performance API...');
    const response = await fetch(`${baseURL}/api/planning/employee-performance`);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    
    console.log('\n🧪 Testing Machine Availability API...');
    const response2 = await fetch(`${baseURL}/api/planning/machine-availability`);
    const data2 = await response2.json();
    console.log('Response:', JSON.stringify(data2, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

testAPI();