import type { NextConfig } from 'next';
import dns from 'dns';

// Paksa Node.js resolve IPv4 terlebih dahulu
dns.setDefaultResultOrder('ipv4first');

const nextconfig: NextConfig = {
  allowedDevOrigins: ['192.168.188.140:3000', '192.168.188.140'],
};

export default nextconfig;